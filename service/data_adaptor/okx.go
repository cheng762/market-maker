package data_adaptor

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func fetchOkxPrice(symbol string, start time.Time, end time.Time) (float64, float64, error) {
	pair := strings.ToUpper(symbol) + "-USDT"
	startTs := start.UnixMilli()
	endTs := end.UnixMilli()

	// 获取开始价格
	url := fmt.Sprintf("https://www.okx.com/api/v5/market/candles?instId=%s&bar=1D&after=%d&limit=1", pair, startTs)
	resp, err := http.Get(url)
	if err != nil {
		return 0, 0, err
	}
	defer resp.Body.Close()
	var startData CandleResponse
	json.NewDecoder(resp.Body).Decode(&startData)

	if len(startData.Data) == 0 {
		return 0, 0, fmt.Errorf("no start data for %s", pair)
	}
	startPrice, _ := strconv.ParseFloat(startData.Data[0][4], 64)

	// 获取结束价格
	url = fmt.Sprintf("https://www.okx.com/api/v5/market/candles?instId=%s&bar=1D&after=%d&limit=1", pair, endTs)
	resp2, err := http.Get(url)
	if err != nil {
		return 0, 0, err
	}
	defer resp2.Body.Close()
	var endData CandleResponse
	json.NewDecoder(resp2.Body).Decode(&endData)
	if len(endData.Data) == 0 {
		return 0, 0, fmt.Errorf("no end data for %s", pair)
	}
	endPrice, _ := strconv.ParseFloat(endData.Data[0][4], 64)

	return startPrice, endPrice, nil
}
