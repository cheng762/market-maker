package data_adaptor

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

func parseStartTime(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	if sec, err := strconv.ParseInt(s, 10, 64); err == nil {
		return time.Unix(sec, 0).UTC(), nil
	}
	layout := "2006-01-02 15:04:05"
	if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
		return t.UTC(), nil
	}
	return time.Time{}, fmt.Errorf("无法解析时间: %s", s)
}

func isWrappedAsset(name, symbol string) bool {
	sym := strings.ToUpper(symbol)
	if wrappedSymbolBlacklist[sym] {
		return true
	}
	n := strings.ToLower(name)
	if strings.Contains(n, "wrapped") {
		return true
	}
	return false
}
