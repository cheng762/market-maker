package calculation

const (
	Long  = "long"
	Short = "short"
)

type Trade struct {
	Operation string  `json:"operation"` // "open" 或 "close"
	Price     float64 `json:"price"`
	Amount    float64 `json:"amount"`
	Leverage  int     `json:"leverage"`
	Direction string  `json:"direction"` // "long" 或 "short"
}

type PnLDetail struct {
	ClosePrice float64 `json:"close_price"`
	Quantity   float64 `json:"quantity"`
	PnL        float64 `json:"pnl"`
	TotalPnL   float64 `json:"total_pnl"`
}

type Result struct {
	TotalPnL   float64     `json:"total_pnl"`
	ROI        float64     `json:"roi_pct"`
	ChangeRate float64     `json:"change_pct"`
	Details    []PnLDetail `json:"details"`
}

// 计算收益
func CalcTrades(trades []Trade) Result {
	var position float64 // 当前仓位
	var avgPrice float64 // 平均开仓价
	var margin float64   // 保证金
	var realizedPnL float64
	var firstPrice float64
	var lastPrice float64
	var direction string
	var details []PnLDetail

	for i, t := range trades {
		if i == 0 {
			firstPrice = t.Price
			direction = t.Direction
		}
		lastPrice = t.Price

		if t.Operation == "open" {
			// 开仓 / 加仓
			totalCost := avgPrice*position + t.Price*t.Amount
			position += t.Amount
			avgPrice = totalCost / position
			margin += t.Price * t.Amount / float64(t.Leverage)

		} else if t.Operation == "close" {
			// 平仓
			closeQty := t.Amount
			if closeQty > position {
				closeQty = position
			}
			var pnlChunk float64
			if direction == "long" {
				pnlChunk = closeQty * (t.Price - avgPrice)
			} else {
				pnlChunk = closeQty * (avgPrice - t.Price)
			}
			realizedPnL += pnlChunk
			position -= closeQty

			details = append(details, PnLDetail{
				ClosePrice: t.Price,
				Quantity:   closeQty,
				PnL:        pnlChunk,
				TotalPnL:   realizedPnL,
			})
		}
	}

	changeRate := (lastPrice - firstPrice) / firstPrice * 100
	roi := (realizedPnL / margin) * 100

	return Result{
		TotalPnL:   realizedPnL,
		ROI:        roi,
		ChangeRate: changeRate,
		Details:    details,
	}
}
