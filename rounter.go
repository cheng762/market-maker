package main

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/urfave/cli/v3"

	"github.com/cheng762/market-maker/service/calculation"
)

func router(context.Context, *cli.Command) error {
	// Creates a gin router with default middleware:
	// logger and recovery (crash-free) middleware
	r := gin.Default()

	r.LoadHTMLGlob("service/calculation/templates/*")

	// 设置静态文件服务, /static URL 路径会映射到 ./static 目录
	r.Static("/static", "./service/calculation/static")

	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", nil)
	})

	// API
	r.POST("/calculate", calculation.HandleBatchCalculation)
	// By default it serves on :8080 unless a
	// PORT environment variable was defined.
	port := ":8080"
	fmt.Printf("服务已启动，请在浏览器中访问 http://localhost%s\n", port)
	if err := r.Run(port); err != nil {
		log.Fatalf("启动服务失败: %v", err)
	}
	return nil
}
