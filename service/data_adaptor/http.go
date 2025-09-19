package data_adaptor

import (
	"net"
	"net/http"
	"time"
)

const httpTimeout = 15 * time.Second

func newHTTPClient() *http.Client {
	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}
	transport := &http.Transport{
		Proxy:               http.ProxyFromEnvironment,
		DialContext:         dialer.DialContext,
		MaxIdleConns:        100,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
	}
	return &http.Client{
		Timeout:   httpTimeout,
		Transport: transport,
	}
}
