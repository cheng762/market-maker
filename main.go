package main

import (
	"context"
	"log"
	"os"

	"github.com/urfave/cli/v3"
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
				Action: func(context.Context, *cli.Command) error {
					return nil
				},
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
