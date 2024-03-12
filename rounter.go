package main

import (
	"context"

	"github.com/gin-gonic/gin"
	"github.com/urfave/cli/v3"
)

func router(context.Context, *cli.Command) error {
	// Creates a gin router with default middleware:
	// logger and recovery (crash-free) middleware
	router := gin.Default()

	router.GET("/some", func(c *gin.Context) {

	})

	// By default it serves on :8080 unless a
	// PORT environment variable was defined.
	return router.Run()
	// router.Run(":3000") for a hard coded port
}
