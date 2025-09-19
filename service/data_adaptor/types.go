package data_adaptor

// CoinGecko market response (partial)
type cgMarket struct {
	ID            string  `json:"id"`
	Symbol        string  `json:"symbol"`
	Name          string  `json:"name"`
	MarketCapRank int     `json:"market_cap_rank"`
	CurrentPrice  float64 `json:"current_price"`
	MarketCap     int64   `json:"market_cap"`
}

type binanceTickerPrice struct {
	Symbol string `json:"symbol"`
	Price  string `json:"price"`
}

type candidate struct {
	Name          string
	Symbol        string
	Pair          string
	StartPrice    float64
	CurrentPrice  float64
	ChangePct     float64
	MarketCap     int64 `json:"market_cap"`
	MarketCapRank int   `json:"market_cap_rank"`
}

var stablecoins = map[string]bool{
	"USDT": true, "USDC": true, "BUSD": true, "TUSD": true, "DAI": true,
	"FDUSD": true, "USDE": true, "USDD": true, "USDJ": true, "GUSD": true,
	"PYUSD": true, "USDP": true, "LUSD": true, "SUSD": true,
}

// 显式排除的 Wrapped 符号（可扩展）
var wrappedSymbolBlacklist = map[string]bool{
	"WBTC":  true,
	"WBETH": true,
	"WETH":  true,
	"WBNB":  true,
	"WAVAX": true,
}

type CandleResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    [][]string
}
