package calculation

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Position 内部用于在计算循环中跟踪仓位状态的结构
type Position struct {
	TotalInvestedUSDT float64
	TotalCryptoAmount float64
	AveragePrice      float64
}

// OperationStep 定义了批处理中的单个操作步骤
type OperationStep struct {
	Operation string  `json:"operation"`          // 操作类型: "open", "add", "reduce", "close"
	Price     float64 `json:"price"`              // 操作价格
	Quantity  float64 `json:"quantity,omitempty"` // 操作数量 (USDT), 平仓时可省略
}

// CalculationResult 定义了对单个操作步骤计算后的结果
type CalculationResult struct {
	Operation         string  `json:"operation"`         // 本次操作类型
	InputPrice        float64 `json:"inputPrice"`        // 输入的操作价格
	InputQuantity     float64 `json:"inputQuantity"`     // 输入的操作数量 (USDT)
	Message           string  `json:"message"`           // 操作结果信息
	RealizedPNL       float64 `json:"realizedPnl"`       // 本次操作实现的盈亏
	AveragePrice      float64 `json:"averagePrice"`      // 该操作完成后的持仓均价
	TotalCryptoAmount float64 `json:"totalCryptoAmount"` // 该操作完成后的总仓位(币)
	TotalInvestedUSDT float64 `json:"totalInvestedUSDT"` // 该操作完成后的总仓位(USDT)
}

func HandleBatchCalculation(c *gin.Context) {
	var operations []OperationStep
	if err := c.ShouldBindJSON(&operations); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求格式，需要一个操作数组: " + err.Error()})
		return
	}

	if len(operations) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "操作列表不能为空"})
		return
	}

	// 验证第一个操作必须是 'open'
	if operations[0].Operation != "open" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "计算必须以 '开仓' 操作开始"})
		return
	}

	// 初始化一个临时的仓位和结果列表
	pos := &Position{}
	var results []CalculationResult

	// 按顺序处理每一个操作
	for i, op := range operations {
		// 基本输入验证
		if op.Price <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("第 %d 步操作错误: 价格必须大于0", i+1)})
			return
		}
		if op.Operation != "close" && op.Quantity <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("第 %d 步操作错误: 数量(USDT)必须大于0", i+1)})
			return
		}

		realizedPNL := 0.0
		message := ""

		switch op.Operation {
		case "open":
			// 如果不是第一步却收到了开仓指令，则为无效序列
			if i > 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("第 %d 步操作错误: '开仓' 操作只能是第一步", i+1)})
				return
			}
			cryptoAmount := op.Quantity / op.Price
			pos.TotalInvestedUSDT = op.Quantity
			pos.TotalCryptoAmount = cryptoAmount
			pos.AveragePrice = op.Price
			message = "开仓成功"

		case "add":
			cryptoAmountToAdd := op.Quantity / op.Price
			pos.TotalInvestedUSDT += op.Quantity
			pos.TotalCryptoAmount += cryptoAmountToAdd
			pos.AveragePrice = pos.TotalInvestedUSDT / pos.TotalCryptoAmount
			message = "加仓成功"

		case "reduce":
			if pos.TotalCryptoAmount == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("第 %d 步操作错误: 试图在空仓位时进行减仓", i+1)})
				return
			}
			cryptoAmountToReduce := op.Quantity / op.Price
			if cryptoAmountToReduce > pos.TotalCryptoAmount {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("第 %d 步操作错误: 减仓数量超过持仓量", i+1)})
				return
			}
			realizedPNL = (op.Price - pos.AveragePrice) * cryptoAmountToReduce
			pos.TotalCryptoAmount -= cryptoAmountToReduce
			pos.TotalInvestedUSDT = pos.TotalCryptoAmount * pos.AveragePrice
			message = "减仓成功"

		case "close":
			if pos.TotalCryptoAmount == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("第 %d 步操作错误: 仓位已空，无需平仓", i+1)})
				return
			}
			realizedPNL = (op.Price - pos.AveragePrice) * pos.TotalCryptoAmount
			pos.TotalInvestedUSDT = 0
			pos.TotalCryptoAmount = 0
			// 均价也归零
			pos.AveragePrice = 0
			message = "平仓成功"

		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("第 %d 步包含无效的操作类型: %s", i+1, op.Operation)})
			return
		}

		// 将这一步的结果添加到结果列表中
		results = append(results, CalculationResult{
			Operation:         op.Operation,
			InputPrice:        op.Price,
			InputQuantity:     op.Quantity,
			Message:           message,
			RealizedPNL:       realizedPNL,
			AveragePrice:      pos.AveragePrice,
			TotalCryptoAmount: pos.TotalCryptoAmount,
			TotalInvestedUSDT: pos.TotalInvestedUSDT,
		})

		// 如果已经平仓，后续不应再有操作
		if op.Operation == "close" && i < len(operations)-1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("第 %d 步操作错误: '平仓' 之后不能再有其他操作", i+2)})
			return
		}
	}

	// 返回完整的结果列表
	c.JSON(http.StatusOK, results)
}
