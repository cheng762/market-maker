# Market Maker

[![Go Version](https://img.shields.io/badge/go-%3E%3D1.19-blue.svg)](https://golang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

一个高性能的市场做市商应用，支持多交易所自动交易策略。

## 功能特性

- **多交易所支持**: 集成Binance、OKX等主流交易所
- **灵活策略**: 可配置的交易策略引擎
- **实时数据**: 高频市场数据适配器
- **风险管理**: 内置风险控制机制
- **Web界面**: 提供可视化监控界面

## 快速开始

### 前置要求

- Go 1.19 或更高版本
- Git

### 安装

```bash
# 克隆项目
git clone https://github.com/your-username/market-maker.git
cd market-maker

# 安装依赖
go mod download

# 构建项目
go build -o market-maker .
```

### 配置

复制配置文件模板并根据需要修改：

```bash
cp config.example.yaml config.yaml
```

编辑 `config.yaml` 配置您的API密钥和交易参数。

### 运行

```bash
# 启动应用
./market-maker

# 或使用Go运行
go run .
```

访问 `http://localhost:8080` 查看Web界面。

## 项目结构

```
market-maker/
├── main.go              # 应用入口
├── cmd.go               # 命令行接口
├── router.go            # HTTP路由
├── common/              # 公共组件
│   └── format.go        # 格式化工具
├── service/             # 业务服务
│   ├── calculation/     # 计算服务
│   │   ├── cal.go
│   │   ├── static/
│   │   └── templates/
│   └── data_adaptor/    # 数据适配器
│       ├── binance.go   # Binance交易所适配器
│       ├── okx.go       # OKX交易所适配器
│       ├── fetch.go     # 数据获取
│       ├── http.go      # HTTP客户端
│       └── types.go     # 类型定义
├── strategy/            # 交易策略
├── utils/               # 工具函数
└── docs/                # 文档和静态文件
    ├── cal.html
    ├── script.js
    └── style.css
```

## 配置说明

### 交易所配置

```yaml
exchanges:
  binance:
    api_key: "your_binance_api_key"
    secret_key: "your_binance_secret_key"
    base_url: "https://api.binance.com"
  okx:
    api_key: "your_okx_api_key"
    secret_key: "your_okx_secret_key"
    passphrase: "your_okx_passphrase"
```

### 策略配置

```yaml
strategy:
  name: "grid_trading"
  parameters:
    grid_levels: 10
    grid_spacing: 0.001
    base_asset: "BTC"
    quote_asset: "USDT"
```

## API文档

### REST API

- `GET /api/status` - 获取系统状态
- `GET /api/balance` - 获取账户余额
- `POST /api/order` - 下单
- `GET /api/orders` - 获取订单列表

### WebSocket

实时市场数据流：

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/market-data');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Market data:', data);
};
```

## 开发

### 运行测试

```bash
go test ./...
```

### 代码格式化

```bash
go fmt ./...
```

### 构建Docker镜像

```bash
docker build -t market-maker .
```

## 部署

### Docker部署

```bash
docker run -p 8080:8080 market-maker
```

### Kubernetes部署

```bash
kubectl apply -f k8s/
```

## 监控和日志

应用使用结构化日志，支持多种输出格式。监控指标通过 `/metrics` 端点暴露。

## 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 免责声明

本软件仅供学习和研究目的使用。使用本软件进行实际交易存在财务风险，请谨慎使用。作者不对使用本软件造成的任何损失承担责任。

## 联系方式

- 项目主页: https://github.com/your-username/market-maker
- 问题反馈: https://github.com/your-username/market-maker/issues
- 邮箱: your-email@example.com
