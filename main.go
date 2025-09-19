package main

import (
	"context"
	"errors"
	"log"
	"os"

	"github.com/urfave/cli/v3"

	"github.com/cheng762/market-maker/service/data_adaptor"
)

var (
	startDateFlag   = &cli.StringFlag{Name: "start", Usage: "起始时间（RFC3339，如 2025-09-01T00:00:00Z，或 Unix 秒时间戳）", Aliases: []string{"s"}}
	concurrencyFlag = &cli.IntFlag{Name: "concurrency", Usage: "并发请求数（默认 5）", Value: 3}
)

func main() {
	cmd := &cli.Command{
		Commands: []*cli.Command{
			{
				Name:   "start",
				Usage:  "start service",
				Action: router,
			},
			{
				Name:  "datafetch",
				Usage: "start data adaptor  service",
				Action: func(ctx context.Context, c *cli.Command) error {

					startStr := c.String(startDateFlag.Name)
					concurrency := c.Int(concurrencyFlag.Name)
					if startStr == "" {
						return errors.New("必须指定 -start 参数，例如 -start 2025-09-01T00:00:00Z 或 -start 1725148800")
					}

					data_adaptor.Fetch(startStr, concurrency)
					return nil
				},
				Flags: []cli.Flag{startDateFlag, concurrencyFlag},
			},
			{
				Name:  "console",
				Usage: "login service with console ",
				Action: func(context.Context, *cli.Command) error {
					return nil
				},
			},
		},
	}

	if err := cmd.Run(context.Background(), os.Args); err != nil {
		log.Fatal(err)
	}
}
