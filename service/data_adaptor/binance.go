package data_adaptor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

func getBinanceTickerPrice(httpClient *http.Client, symbol string) (float64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), httpTimeout)
	defer cancel()

	url := fmt.Sprintf("%s/api/v3/ticker/price?symbol=%s", binanceBaseURL, symbol)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "top20-usdt-analyzer/1.0")

	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("请求 Binance ticker 失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<10))
		return 0, fmt.Errorf("Binance ticker 响应码 %d: %s", resp.StatusCode, string(body))
	}

	var tp binanceTickerPrice
	if err := json.NewDecoder(resp.Body).Decode(&tp); err != nil {
		return 0, fmt.Errorf("解析 ticker 失败: %w", err)
	}
	price, err := strconv.ParseFloat(tp.Price, 64)
	if err != nil {
		return 0, fmt.Errorf("解析价格失败: %w", err)
	}
	return price, nil
}

func getBinanceFirstOpenPrice(httpClient *http.Client, symbol string, start time.Time) (float64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), httpTimeout)
	defer cancel()

	url := fmt.Sprintf("%s/api/v3/klines?symbol=%s&interval=1m&startTime=%d&limit=1",
		binanceBaseURL, symbol, start.UTC().UnixMilli())

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "top20-usdt-analyzer/1.0")

	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("请求 Binance klines 失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<10))
		return 0, fmt.Errorf("Binance klines 响应码 %d: %s", resp.StatusCode, string(body))
	}

	var klines [][]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&klines); err != nil {
		return 0, fmt.Errorf("解析 klines 失败: %w", err)
	}
	if len(klines) == 0 {
		return 0, errors.New("未返回任何 K 线（可能该时间之前未上市或无交易）")
	}

	openStr, ok := klines[0][1].(string)
	if !ok {
		return 0, errors.New("K 线 open 字段格式异常")
	}
	open, err := strconv.ParseFloat(openStr, 64)
	if err != nil {
		return 0, fmt.Errorf("解析 open 失败: %w", err)
	}
	return open, nil
}
