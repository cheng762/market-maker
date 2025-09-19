package main

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/urfave/cli/v3"

	"github.com/cheng762/market-maker/service/calculation"
)

func router(context.Context, *cli.Command) error {
	// Creates a gin router with default middleware:
	// logger and recovery (crash-free) middleware
	router := gin.Default()

	router.GET("/cal", func(c *gin.Context) {
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusOK, calculation.HtmlPage)
	})

	// API
	router.POST("/calc", func(c *gin.Context) {
		var trades []calculation.Trade
		if err := c.ShouldBindJSON(&trades); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		res := calculation.CalcTrades(trades)
		//if err != nil {
		//	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		//	return
		//}
		c.JSON(http.StatusOK, res)
	})

	// By default it serves on :8080 unless a
	// PORT environment variable was defined.
	return router.Run()
}
