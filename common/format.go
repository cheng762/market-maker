package common

import (
	"strconv"
	"strings"
)

// formatFloatWithComma 格式化 float64，支持千分位和指定小数位数
func FormatFloatWithComma(f float64, decimals int) string {
	// 先转成字符串，保留指定小数位
	str := strconv.FormatFloat(f, 'f', decimals, 64)

	// 分离整数部分和小数部分
	parts := strings.Split(str, ".")
	intPart := parts[0]
	decPart := ""
	if len(parts) > 1 {
		decPart = parts[1]
	}

	// 给整数部分加千分位
	nStr := ""
	for i, v := range intPart {
		if i != 0 && (len(intPart)-i)%3 == 0 {
			nStr += ","
		}
		nStr += string(v)
	}

	// 拼接
	if decimals > 0 {
		return nStr + "." + decPart
	}
	return nStr
}

func FormatIntWithComma(n int64) string {
	s := strconv.FormatInt(n, 10)
	nStr := ""
	for i, v := range s {
		if i != 0 && (len(s)-i)%3 == 0 {
			nStr += ","
		}
		nStr += string(v)
	}
	return nStr
}
