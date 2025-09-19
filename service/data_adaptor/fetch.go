package data_adaptor

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/cheng762/market-maker/common"
)

const (
	coinGeckoMarketsURL = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1"
	binanceBaseURL      = "https://api.binance.com"
)

func Fetch(start string, concurrency int) {

	startTime, err := parseStartTime(start)
	if err != nil {
		fmt.Printf("解析起始时间失败: %v\n", err)
		os.Exit(1)
	}

	httpClient := newHTTPClient()

	topCoins, err := fetchTop20Coins(httpClient)
	if err != nil {
		fmt.Printf("获取市值前20失败: %v\n", err)
		os.Exit(1)
	}

	// 过滤掉稳定币和 Wrapped 类资产
	filtered := make([]cgMarket, 0, len(topCoins))
	for _, c := range topCoins {
		base := strings.ToUpper(c.Symbol)
		if stablecoins[base] {
			continue
		}
		if isWrappedAsset(c.Name, c.Symbol) {
			continue
		}
		filtered = append(filtered, c)
	}

	// 并发分析每个币的 USDT 对在 Binance 上的涨幅
	sem := make(chan struct{}, concurrency)
	resultsCh := make(chan *candidate, len(filtered))
	errCh := make(chan error, len(filtered))

	for _, coin := range filtered {
		coin := coin
		sem <- struct{}{}
		go func() {
			defer func() { <-sem }()
			res, err := analyzeCoin(httpClient, coin, startTime)
			if err != nil {
				errCh <- fmt.Errorf("%s(%s): %v", coin.Name, coin.Symbol, err)
				return
			}
			if res != nil {
				resultsCh <- res
			}
			time.Sleep(time.Second)
		}()
	}

	// 等待所有 goroutine 完成（通过占满信号量方式）
	for i := 0; i < cap(sem); i++ {
		sem <- struct{}{}
	}
	close(resultsCh)
	close(errCh)

	results := make([]*candidate, 0, len(filtered))
	for r := range resultsCh {
		results = append(results, r)
	}
	for e := range errCh {
		fmt.Fprintf(os.Stderr, "跳过: %v\n", e)
	}

	// 排序取前10
	sort.Slice(results, func(i, j int) bool {
		return results[i].ChangePct > results[j].ChangePct
	})
	if len(results) > 10 {
		results = results[:10]
	}

	// 输出
	fmt.Printf("从 %s 到现在，市值前20中（排除稳定币与 Wrapped 类资产），USDT 交易对涨幅前10：\n", startTime.UTC().Format(time.RFC3339))
	for i, r := range results {
		fmt.Printf("%2d) %s (%s) 交易对: %s 市值(%d):%s 起始价: %.4f  现价: %.4f  涨幅: %.2f%%\n",
			i+1, r.Name, strings.ToUpper(r.Symbol), r.Pair, r.MarketCapRank, common.FormatIntWithComma(r.MarketCap), r.StartPrice, r.CurrentPrice, r.ChangePct)
	}

	latStartPrice, latEndPrice, err := fetchOkxPrice("lat", startTime, time.Now())
	if err != nil {
		fmt.Printf("fail to fetch lat latest price: %v\n", err)
		return
	}

	latChangePct := (latEndPrice - latStartPrice) / latStartPrice * 100.0

	fmt.Printf("%2d) %s (%s) 交易对: %s  起始价: %.5f  现价: %.5f  涨幅: %.2f%%\n",
		100, "Lat", "LAT", "LAT/USDT", latStartPrice, latEndPrice, latChangePct)
}

func fetchTop20Coins(httpClient *http.Client) ([]cgMarket, error) {
	ctx, cancel := context.WithTimeout(context.Background(), httpTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, coinGeckoMarketsURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "top20-usdt-analyzer/1.0")
	if apiKey := os.Getenv("COINGECKO_API_KEY"); apiKey != "" {
		req.Header.Set("x-cg-demo-api-key", apiKey)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 CoinGecko 失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<10))
		return nil, fmt.Errorf("CoinGecko 响应码 %d: %s", resp.StatusCode, string(body))
	}

	var out []cgMarket
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("解析 CoinGecko 响应失败: %w", err)
	}
	return out, nil
}

func analyzeCoin(httpClient *http.Client, coin cgMarket, start time.Time) (*candidate, error) {
	base := strings.ToUpper(coin.Symbol)
	if stablecoins[base] || isWrappedAsset(coin.Name, coin.Symbol) {
		return nil, fmt.Errorf("排除资产（稳定币或 Wrapped）: %s", base)
	}
	pair := base + "USDT"

	// 当前价
	cur, err := getBinanceTickerPrice(httpClient, pair)
	if err != nil {
		return nil, err
	}

	// 起始时间的开盘价（1m K 线，取 >= start 的第一根K线的开盘价）
	open, err := getBinanceFirstOpenPrice(httpClient, pair, start)
	if err != nil {
		return nil, err
	}
	if open <= 0 {
		return nil, fmt.Errorf("无有效起始价格")
	}

	changePct := (cur - open) / open * 100.0

	return &candidate{
		Name:          coin.Name,
		Symbol:        base,
		Pair:          pair,
		StartPrice:    open,
		CurrentPrice:  cur,
		ChangePct:     changePct,
		MarketCap:     coin.MarketCap,
		MarketCapRank: coin.MarketCapRank,
	}, nil
}
