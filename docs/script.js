class Calculator {
  constructor() {
    this.currentData = {
      openPrice: null,
      highPrice: null,
      lowPrice: null,
      currentPrice: null,
      symbol: 'BTC-USDT'
    };
    this.positionType = 'spot'; // 'spot' | 'long' | 'short'
    this.leverage = 1;
    this.lastModified = null; // 'percent' | 'price' | 'daily'
    this.tickerInterval = null;
    this.fundingRateInterval = null; // 资金费率更新定时器
    this.positionInterval = null; // 持仓数据更新定时器
    this.currentPrecision = 2; // 默认精度
    this.symbolInputTimeout = null; // 防抖定时器
    this.isLoadingPrice = false; // 防止重复请求
    this.isLoadingHistory = false; // 防止重复请求
    this.historyTable = null; // DataTables 实例
    this.currentFundingRate = null; // 当前资金费率
    this.apiConfig = this.loadApiConfig(); // API配置
    this.positionData = null; // 持仓数据
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadCachedSymbol(); // 加载缓存的币种
    this.updateApiConfigUI(); // 更新API配置UI状态
    this.updateApiStatusUI(); // 更新API功能按钮状态

    this.fetchPriceData(); // 页面加载时自动获取价格数据

    // 只有已配置API时，才自动获取持仓信息
    if (this.apiConfig) {
      setTimeout(() => {
        this.fetchPositionData();
      }, 1000); // 延迟1秒，等待价格数据加载完成
    }
  }

  bindEvents() {
    // 设置按钮 - 打开弹窗
    document.getElementById('settingsBtn').addEventListener('click', () => {
      this.openModal();
    });

    // 持仓类型按钮切换
    const posTypeBtns = document.querySelectorAll('.pos-type-btn');
    posTypeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        posTypeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.positionType = btn.dataset.type;

        const leverageGroup = document.getElementById('leverageGroup');
        if (this.positionType === 'spot') {
          leverageGroup.style.display = 'none';
        } else {
          leverageGroup.style.display = 'block';
        }

        // 更新期望点位/幅度关联显示
        if (this.lastModified === 'percent') {
          this.updateTargetPriceFromPercent();
        } else if (this.lastModified === 'price') {
          this.updateTargetPercentFromPrice();
        }
        this.calculate();
      });
    });

    // 杠杆倍数输入
    const leverageInput = document.getElementById('leverageInput');
    if (leverageInput) {
      leverageInput.addEventListener('input', () => {
        this.leverage = Math.max(1, parseFloat(leverageInput.value) || 1);
        this.calculate();
      });
    }

    // 关闭弹窗
    document.getElementById('closeModal').addEventListener('click', () => {
      this.closeModal();
    });

    // 点击弹窗外部关闭
    document.getElementById('apiModal').addEventListener('click', (e) => {
      if (e.target.id === 'apiModal') {
        this.closeModal();
      }
    });

    // ESC键关闭弹窗
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    });

    // 保存API配置
    document.getElementById('saveApiConfig').addEventListener('click', () => {
      this.saveApiConfig();
    });

    // 清除API配置
    document.getElementById('clearApiConfig').addEventListener('click', () => {
      this.clearApiConfig();
    });

    // 同步持仓价格按钮
    document.getElementById('syncPositionPrice').addEventListener('click', () => {
      this.syncPositionPrice();
    });

    // 币种输入自动获取（防抖）
    document.getElementById('symbol').addEventListener('input', (e) => {
      const symbol = e.target.value.trim();

      // 保存币种到缓存
      this.saveSymbolCache(symbol);

      // 清除之前的定时器
      if (this.symbolInputTimeout) {
        clearTimeout(this.symbolInputTimeout);
      }

      // 如果输入为空，清除数据
      if (!symbol) {
        this.clearAllData();
        return;
      }

      // 设置新的定时器，1秒后执行
      this.symbolInputTimeout = setTimeout(() => {
        this.fetchPriceData();
      }, 1000);
    });

    // 历史天数选择自动获取
    document.getElementById('historyDays').addEventListener('change', () => {
      const symbol = document.getElementById('symbol').value.trim();
      if (symbol && this.currentData.currentPrice) {
        this.fetchHistoryData();
      }
    });

    // 持仓价输入
    document.getElementById('holdPrice').addEventListener('input', () => {
      // 如果有当日涨跌幅预期，持仓价变化时也实时联动
      if (document.getElementById('dailyExpectPercent').value.trim() !== '') {
        this.lastModified = 'daily';
        this.updateFromDailyExpected();
      }
      this.calculate();
    });

    // 期望幅度（相对持仓）
    document.getElementById('targetPercent').addEventListener('input', () => {
      this.lastModified = 'percent';
      this.updateTargetPriceFromPercent();
      this.updateDailyExpectFromTarget(); // 反推当日预期（若有开盘价）
      this.calculate();
    });

    // 期望点位（目标价格）
    document.getElementById('targetPrice').addEventListener('input', () => {
      this.lastModified = 'price';
      this.updateTargetPercentFromPrice();
      this.updateDailyExpectFromTarget(); // 反推当日预期（若有开盘价）
      this.calculate();
    });

    // 当日涨跌幅预期（相对开盘）
    document.getElementById('dailyExpectPercent').addEventListener('input', () => {
      this.lastModified = 'daily';
      this.updateFromDailyExpected();
      this.calculate();
    });

    // 币种输入回车获取价格
    document.getElementById('symbol').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        // 清除防抖定时器，立即执行
        if (this.symbolInputTimeout) {
          clearTimeout(this.symbolInputTimeout);
        }
        this.fetchPriceData();
      }
    });

    // 初始同步输入步进
    this.syncPrecisionSteps();
  }

  // 清除所有数据
  clearAllData() {
    this.currentData = {
      openPrice: null,
      highPrice: null,
      lowPrice: null,
      currentPrice: null,
      symbol: ''
    };
    this.currentFundingRate = null;
    this.positionData = null;
    document.getElementById('priceInfo').style.display = 'none';
    document.getElementById('positionInfo').style.display = 'none';
    document.getElementById('historySummary').style.display = 'none';
    document.getElementById('historyResults').style.display = 'none';
    const resultsEl = document.getElementById('results');
    if (resultsEl) resultsEl.style.display = 'none';
    this.hideMessage();

    // 清理 DataTables
    if (this.historyTable) {
      this.historyTable.destroy();
      this.historyTable = null;
    }

    // 清理定时器
    if (this.tickerInterval) {
      clearInterval(this.tickerInterval);
      this.tickerInterval = null;
    }
    if (this.fundingRateInterval) {
      clearInterval(this.fundingRateInterval);
      this.fundingRateInterval = null;
    }
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }

  // 打开弹窗
  openModal() {
    document.getElementById('apiModal').classList.add('show');
    document.body.style.overflow = 'hidden'; // 防止背景滚动
  }

  // 关闭弹窗
  closeModal() {
    document.getElementById('apiModal').classList.remove('show');
    document.body.style.overflow = ''; // 恢复滚动
  }

  // 加载缓存的币种
  loadCachedSymbol() {
    const cachedSymbol = localStorage.getItem('cached_symbol');
    if (cachedSymbol) {
      document.getElementById('symbol').value = cachedSymbol;
      this.currentData.symbol = cachedSymbol;
    }
  }

  // 保存币种到缓存
  saveSymbolCache(symbol) {
    if (symbol) {
      localStorage.setItem('cached_symbol', symbol);
    } else {
      localStorage.removeItem('cached_symbol');
    }
  }

  // 加载API配置
  loadApiConfig() {
    const config = localStorage.getItem('okx_api_config');
    if (config) {
      try {
        return JSON.parse(config);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // 新增：根据API状态更新UI显隐
  updateApiStatusUI() {
    const hasApi = !!this.apiConfig;

    // 1. 设置按钮状态点
    const statusDot = document.getElementById('apiStatusDot');
    if (statusDot) {
      statusDot.style.display = hasApi ? 'block' : 'none';
    }

    // 2. 控制API相关功能按钮（如同步按钮）
    const apiBtns = document.querySelectorAll('.api-feature-btn');
    apiBtns.forEach(btn => {
      btn.style.display = hasApi ? 'block' : 'none';
    });

    // 3. 如果没有API，隐藏并清空持仓信息栏
    if (!hasApi) {
      document.getElementById('positionInfo').style.display = 'none';
      this.positionData = null;
      // 停止持仓更新定时器
      if (this.positionInterval) {
        clearInterval(this.positionInterval);
        this.positionInterval = null;
      }
    }
  }

  // 保存API配置
  saveApiConfig() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiSecret = document.getElementById('apiSecret').value.trim();
    const apiPassphrase = document.getElementById('apiPassphrase').value.trim();

    if (!apiKey || !apiSecret || !apiPassphrase) {
      this.showMessage('请填写完整的API配置信息', 'error');
      return;
    }

    const config = {
      apiKey,
      apiSecret,
      apiPassphrase
    };
    localStorage.setItem('okx_api_config', JSON.stringify(config));
    this.apiConfig = config;

    this.showMessage('API配置保存成功', 'success');
    setTimeout(() => this.hideMessage(), 2000);

    // 更新界面状态
    this.updateApiStatusUI();

    // 关闭弹窗
    this.closeModal();

    // 保存后立即获取持仓数据
    this.fetchPositionData();

    // 重新启动自动更新以包含持仓
    this.startAutoUpdate();
  }

  // 新增：清除API配置
  clearApiConfig() {
    localStorage.removeItem('okx_api_config');
    this.apiConfig = null;

    document.getElementById('apiKey').value = '';
    document.getElementById('apiSecret').value = '';
    document.getElementById('apiPassphrase').value = '';

    this.updateApiStatusUI();
    this.showMessage('API配置已清除', 'success');
    setTimeout(() => this.hideMessage(), 2000);

    this.closeModal();
  }

  // 更新API配置UI
  updateApiConfigUI() {
    if (this.apiConfig) {
      document.getElementById('apiKey').value = this.apiConfig.apiKey;
      document.getElementById('apiSecret').value = this.apiConfig.apiSecret;
      document.getElementById('apiPassphrase').value = this.apiConfig.apiPassphrase;
    }
  }

  // 生成OKX API签名
  generateSignature(timestamp, method, requestPath, body = '') {
    const message = timestamp + method + requestPath + body;
    const hmac = CryptoJS.HmacSHA256(message, this.apiConfig.apiSecret);
    return CryptoJS.enc.Base64.stringify(hmac);
  }

  // 辅助方法：解析永续合约 Symbol
  resolveSwapSymbol(symbol) {
    if (!symbol) return '';
    const s = symbol.trim();
    if (s.toUpperCase().endsWith('-SWAP')) {
      return s;
    }
    return `${s}-SWAP`;
  }

  // 辅助方法：设置持仓类型UI状态
  setPositionType(type) {
    this.positionType = type;
    const posTypeBtns = document.querySelectorAll('.pos-type-btn');
    posTypeBtns.forEach(btn => {
      if (btn.dataset.type === type) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const leverageGroup = document.getElementById('leverageGroup');
    if (type === 'spot') {
      if (leverageGroup) leverageGroup.style.display = 'none';
    } else {
      if (leverageGroup) leverageGroup.style.display = 'block';
    }
  }

  // 获取持仓数据
  async fetchPositionData() {
    if (!this.apiConfig) {
      return;
    }

    const rawSymbol = document.getElementById('symbol').value.trim();
    if (!rawSymbol) return;

    try {
      const swapInstId = this.resolveSwapSymbol(rawSymbol);
      const timestamp = new Date().toISOString();
      const method = 'GET';
      const requestPath = `/api/v5/account/positions?instId=${swapInstId}`;

      const signature = this.generateSignature(timestamp, method, requestPath);

      const headers = {
        'OK-ACCESS-KEY': this.apiConfig.apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': this.apiConfig.apiPassphrase,
        'Content-Type': 'application/json'
      };

      const response = await fetch(`https://www.okx.com${requestPath}`, {
        method: method,
        headers: headers
      });

      const data = await response.json();

      if (data.code === '0' && data.data?.length > 0) {
        // 找到当前币种的持仓
        const position = data.data.find(p => p.instId === swapInstId || p.instId === rawSymbol);
        if (position && parseFloat(position.pos) !== 0) {
          this.positionData = position;
          this.updatePositionDisplay();
        } else {
          this.positionData = null;
          document.getElementById('positionInfo').style.display = 'none';
        }
      } else {
        this.positionData = null;
        document.getElementById('positionInfo').style.display = 'none';
      }
    } catch (err) {
      console.error('获取持仓数据失败：', err);
    }
  }

  // 更新持仓信息显示
  updatePositionDisplay() {
    const positionInfo = document.getElementById('positionInfo');

    if (!this.positionData) {
      if (positionInfo) {
        positionInfo.style.display = 'none';
      }
      return;
    }

    const pos = this.positionData;

    // 确保精度值有效
    const precision = (this.currentPrecision && this.currentPrecision > 0) ? this.currentPrecision : 2;

    // 持仓方向
    let posSideText = '持仓';
    if (pos.posSide === 'long') {
      posSideText = '做多';
    } else if (pos.posSide === 'short') {
      posSideText = '做空';
    } else if (pos.posSide === 'net') {
      posSideText = parseFloat(pos.pos) < 0 ? '做空' : '做多';
    }

    const positionSideEl = document.getElementById('positionSide');
    if (positionSideEl) {
      positionSideEl.textContent = posSideText;
      if (posSideText === '做多') {
        positionSideEl.className = 'positive';
      } else if (posSideText === '做空') {
        positionSideEl.className = 'negative';
      } else {
        positionSideEl.className = 'neutral';
      }
    }

    // 持仓数量
    const positionSizeEl = document.getElementById('positionSize');
    if (positionSizeEl) {
      positionSizeEl.textContent = parseFloat(pos.margin || pos.pos || 0).toFixed(4);
    }

    // 持仓均价
    const avgPx = parseFloat(pos.avgPx);
    const positionAvgPriceEl = document.getElementById('positionAvgPrice');
    if (positionAvgPriceEl && isFinite(avgPx)) {
      positionAvgPriceEl.textContent = avgPx.toFixed(precision);
    }

    // 爆仓价格
    const liqPx = parseFloat(pos.liqPx);
    const liquidationPriceEl = document.getElementById('liquidationPrice');
    if (liquidationPriceEl) {
      if (liqPx > 0 && isFinite(liqPx)) {
        liquidationPriceEl.textContent = liqPx.toFixed(precision);
      } else {
        liquidationPriceEl.textContent = 'N/A';
      }
    }

    // 未实现盈亏
    const upl = parseFloat(pos.upl);
    const uplEl = document.getElementById('unrealizedPnl');
    if (uplEl && isFinite(upl)) {
      uplEl.textContent = `${upl >= 0 ? '+' : ''}${upl.toFixed(2)}`;
      uplEl.className = upl >= 0 ? 'positive' : 'negative';
    }

    // 杠杆倍数
    const leverageEl = document.getElementById('leverage');
    if (leverageEl) {
      leverageEl.textContent = `${pos.lever}x`;
    }

    if (positionInfo) {
      positionInfo.style.display = 'flex';
    }
  }

  // 同步持仓价格
  syncPositionPrice() {
    if (!this.positionData) {
      this.showMessage('未获取到持仓数据，请确保已配置API并有持仓', 'error');
      setTimeout(() => this.hideMessage(), 2000);
      return;
    }

    const avgPx = parseFloat(this.positionData.avgPx);
    const precision = (this.currentPrecision && this.currentPrecision > 0) ? this.currentPrecision : 2;

    if (avgPx > 0 && isFinite(avgPx)) {
      document.getElementById('holdPrice').value = avgPx.toFixed(precision);

      // 自动设置持仓方向
      const rawPosSide = this.positionData.posSide;
      let side = 'long';
      if (rawPosSide === 'short') {
        side = 'short';
      } else if (rawPosSide === 'net') {
        side = parseFloat(this.positionData.pos) < 0 ? 'short' : 'long';
      }
      this.setPositionType(side);

      // 自动设置杠杆
      const lever = parseFloat(this.positionData.lever);
      if (lever && isFinite(lever)) {
        this.leverage = lever;
        const leverageInput = document.getElementById('leverageInput');
        if (leverageInput) leverageInput.value = lever;
      }

      this.calculate();
      this.showMessage('已同步持仓均价及合约参数', 'success');
      setTimeout(() => this.hideMessage(), 1500);
    } else {
      this.showMessage('持仓均价无效', 'error');
      setTimeout(() => this.hideMessage(), 2000);
    }
  }

  // 检测价格的小数位数
  detectPricePrecision(prices) {
    let maxDecimalPlaces = 2; // 默认最少2位小数

    prices.forEach(price => {
      if (price && isFinite(price)) {
        const priceStr = price.toString();
        if (priceStr.includes('.')) {
          const decimalPlaces = priceStr.split('.')[1].length;
          maxDecimalPlaces = Math.max(maxDecimalPlaces, decimalPlaces);
        }
      }
    });

    // 限制在2-8位小数之间
    return Math.min(Math.max(maxDecimalPlaces, 2), 8);
  }

  // 自动设置价格精度
  autoSetPrecision(prices) {
    const detectedPrecision = this.detectPricePrecision(prices);

    // 只在精度确实需要改变时才更新
    if (this.currentPrecision !== detectedPrecision) {
      this.currentPrecision = detectedPrecision;
      this.syncPrecisionSteps();
    }
  }

  // 步进同步：期望点位与价格显示精度一致
  syncPrecisionSteps() {
    const stepStr = (1 / Math.pow(10, this.currentPrecision)).toFixed(this.currentPrecision);
    const targetPriceEl = document.getElementById('targetPrice');
    const holdPriceEl = document.getElementById('holdPrice');

    targetPriceEl.step = stepStr;
    holdPriceEl.step = stepStr;
  }

  // 将期望点位值按当前精度重写显示
  syncTargetPricePrecision() {
    const tp = parseFloat(document.getElementById('targetPrice').value);
    if (isFinite(tp)) {
      document.getElementById('targetPrice').value = tp.toFixed(this.currentPrecision);
    }
  }

  // 格式化交易量显示
  formatVolume(volume) {
    if (volume >= 1e9) {
      return (volume / 1e9).toFixed(2) + 'B';
    } else if (volume >= 1e6) {
      return (volume / 1e6).toFixed(2) + 'M';
    } else if (volume >= 1e3) {
      return (volume / 1e3).toFixed(2) + 'K';
    } else {
      return volume.toFixed(2);
    }
  }

  // 获取资金费率
  async fetchFundingRate(symbol) {
    try {
      const swapSymbol = this.resolveSwapSymbol(symbol);
      const resp = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${swapSymbol}`);
      const data = await resp.json();

      if (data.code === '0' && data.data?.length) {
        const fundingRate = parseFloat(data.data[0].fundingRate);
        const fundingRatePercent = (fundingRate * 100).toFixed(4);
        return fundingRatePercent;
      }
      return null;
    } catch (err) {
      console.warn('获取资金费率失败：', err);
      return null;
    }
  }

  async fetchPriceData() {
    let symbol = document.getElementById('symbol').value.trim();
    if (!symbol) {
      this.showMessage('请输入币种', 'error');
      return;
    }

    // 防止重复请求
    if (this.isLoadingPrice) return;
    this.isLoadingPrice = true;

    this.showMessage('正在获取价格数据...', 'loading');

    try {
      // 获取 1D K 线（开盘价/最高/最低）
      let klineResp = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=1D&limit=1`);
      let klineData = await klineResp.json();

      // 获取最新 ticker（当前价）
      let tickerResp = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}`);
      let tickerData = await tickerResp.json();

      // 如果第一遍获取失败（例如美股合约输入的 SKHYNIX-USDT 在现货不存在），自动尝试 -SWAP
      if ((klineData.code !== '0' || tickerData.code !== '0' || !klineData.data?.length || !tickerData.data?.length) && !symbol.toUpperCase().endsWith('-SWAP')) {
        const fallbackSymbol = `${symbol}-SWAP`;
        const fbKlineResp = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${fallbackSymbol}&bar=1D&limit=1`);
        const fbKlineData = await fbKlineResp.json();
        const fbTickerResp = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${fallbackSymbol}`);
        const fbTickerData = await fbTickerResp.json();

        if (fbKlineData.code === '0' && fbTickerData.code === '0' && fbKlineData.data?.length && fbTickerData.data?.length) {
          symbol = fallbackSymbol;
          document.getElementById('symbol').value = symbol;
          this.saveSymbolCache(symbol);
          klineData = fbKlineData;
          tickerData = fbTickerData;
        }
      }

      if (klineData.code !== '0' || tickerData.code !== '0' || !klineData.data?.length || !tickerData.data?.length) {
        throw new Error('获取价格数据失败，请检查币种格式或稍后重试');
      }

      const k = klineData.data[0];
      const openPrice = parseFloat(k[1]); // 开盘
      const highPrice = parseFloat(k[2]); // 当日高
      const lowPrice = parseFloat(k[3]); // 当日低
      const currentPrice = parseFloat(tickerData.data[0].last);

      this.currentData = {
        openPrice,
        highPrice,
        lowPrice,
        currentPrice,
        symbol
      };

      // 自动设置价格精度
      this.autoSetPrecision([openPrice, highPrice, lowPrice, currentPrice]);

      // 获取资金费率
      this.currentFundingRate = await this.fetchFundingRate(symbol);

      this.updatePriceDisplay();
      this.syncTargetPricePrecision();
      this.calculate();
      this.showMessage('价格数据获取成功', 'success');

      // 启动定时更新
      this.startAutoUpdate();

      // 自动获取历史数据
      this.fetchHistoryData();

      // 如果配置了API，获取持仓数据
      if (this.apiConfig) {
        this.fetchPositionData();
      }

    } catch (err) {
      console.error(err);
      this.showMessage(err.message || 'API调用失败，请检查网络或币种格式', 'error');
      this.currentData = {
        openPrice: null,
        highPrice: null,
        lowPrice: null,
        currentPrice: null,
        symbol
      };
      this.updatePriceDisplay();
    } finally {
      this.isLoadingPrice = false;
    }
  }

  // 新增：获取详细K线数据以匹配最高/最低价时间
  async fetchDetailedHistoryAndMatch(symbol, days, dailyKlines) {
    // 策略：天数少时用5m精度高，天数多时用1H避免请求过多
    let bar = '1H';
    if (days <= 7) {
      bar = '15m';
    }

    this.showMessage(`正在获取详细时间数据 (粒度: ${bar})...`, 'loading');

    // 修正逻辑：我们要获取直到 dailyKlines 中 *最旧* 的日期为止
    // dailyKlines 是按时间正序排列的 (index 0 是最旧的)
    const oldestTimestamp = parseInt(dailyKlines[0][0]);

    const allDetailedCandles = [];
    let currentCursor = ''; // 分页游标 (请求比该ID更旧的数据)

    // 增加最大请求限制，防止死循环
    const MAX_REQUESTS = 100;
    let requestCount = 0;

    try {
      while (requestCount < MAX_REQUESTS) {
        let url = `https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=${bar}&limit=100`;
        if (currentCursor) {
          url += `&after=${currentCursor}`;
        }

        const resp = await fetch(url);
        const data = await resp.json();

        if (data.code !== '0' || !data.data || data.data.length === 0) {
          break;
        }

        const candles = data.data;
        allDetailedCandles.push(...candles);

        // OKX返回的数据是按时间倒序的（最新的在前）
        // cursor 设置为本页最后一条（最旧一条）的时间戳
        currentCursor = candles[candles.length - 1][0];

        // 修正：如果获取到的数据的最旧时间 已经小于 我们需要的起始时间，说明已经覆盖到了
        // 增加一个缓冲时间 (24小时)，确保覆盖边界
        if (parseInt(currentCursor) < oldestTimestamp - 86400000) {
          break;
        }

        requestCount++;
        // 简单的防速率限制延迟
        await new Promise(r => setTimeout(r, 100));
      }

      console.log(`获取到 ${allDetailedCandles.length} 条详细K线数据`);

      return {
        detailedCandles: allDetailedCandles,
        bar: bar
      };

    } catch (err) {
      console.warn('获取详细历史数据失败:', err);
      return {
        detailedCandles: [],
        bar: bar
      };
    }
  }

  // 新增：获取历史持仓量 (Open Interest)
  async fetchOpenInterestHistory(symbol, days) {
    try {
      // 从 symbol 中提取币种 (例如 BTC-USDT -> BTC)
      const ccy = symbol.split('-')[0];
      if (!ccy) return null;

      // 获取历史 OI 数据 (按币种聚合)
      // 使用 api.allorigins.win 解决 CORS 问题 (corsproxy.io 被屏蔽)
      const resp = await fetch(`https://api.allorigins.win/get?url=` + encodeURIComponent(`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${ccy}&period=1D`));
      const rawData = await resp.json();
      const data = JSON.parse(rawData.contents);

      if (data.code === '0' && data.data?.length) {
        // 构建 timestamp -> oi 的映射
        const oiMap = {};
        data.data.forEach(item => {
          // item: [ts, oi, vol]
          const ts = parseInt(item[0]);
          const oi = parseFloat(item[1]);
          // 将时间戳归一化到当天的 00:00:00 (UTC+8) 或者直接使用原始时间戳匹配
          // OKX 返回的时间戳通常是整点，这里我们假设它与 K 线时间戳对齐 (都是开盘时间)
          oiMap[ts] = oi;
        });
        return oiMap;
      }
      return null;
    } catch (err) {
      console.warn('获取持仓量数据失败:', err);
      return null;
    }
  }

  async fetchHistoryData() {
    const symbol = document.getElementById('symbol').value.trim();
    const days = parseInt(document.getElementById('historyDays').value);

    if (!symbol) {
      this.showMessage('请输入币种', 'error');
      return;
    }

    // 防止重复请求
    if (this.isLoadingHistory) return;
    this.isLoadingHistory = true;

    this.showMessage('正在获取历史数据...', 'loading');

    try {
      // 1. 获取基础日线数据
      const resp = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=1D&limit=${days}`);
      const data = await resp.json();

      console.log('历史数据API响应:', data);

      if (data.code !== '0' || !data.data?.length) {
        throw new Error('获取历史数据失败，请检查币种格式或稍后重试');
      }

      // 数据是按时间倒序的，需要反转为正序，并只取需要的天数
      // 注意：API返回的数据可能比limit多或者正好，这里截取
      const klines = data.data.slice(0, days).reverse();

      // 2. 获取详细数据以匹配时间
      const {
        detailedCandles,
        bar
      } = await this.fetchDetailedHistoryAndMatch(symbol, days, klines);

      // 3. 并行获取持仓量数据
      const oiMap = await this.fetchOpenInterestHistory(symbol, days);

      // 收集所有价格用于精度检测
      const allPrices = [];
      klines.forEach(k => {
        allPrices.push(parseFloat(k[1]), parseFloat(k[2]), parseFloat(k[3]), parseFloat(k[4]));
      });

      if (!this.currentData.currentPrice) {
        this.autoSetPrecision(allPrices);
      }

      const historyData = this.processHistoryData(klines, detailedCandles, bar, oiMap);
      console.log('处理后的历史数据:', historyData);

      this.displayHistoryResults(historyData);
      this.showMessage(`历史数据获取成功 (${historyData.length}天)`, 'success');

    } catch (err) {
      console.error('获取历史数据错误:', err);
      this.showMessage(err.message || '获取历史数据失败', 'error');
      document.getElementById('historySummary').style.display = 'none';
      document.getElementById('historyResults').style.display = 'none';
    } finally {
      this.isLoadingHistory = false;
    }
  }

  processHistoryData(klines, detailedCandles, barType, oiMap) {
    const historyData = [];
    let prevClosePrice = null;
    let firstOpenPrice = null;

    for (let i = 0; i < klines.length; i++) {
      const k = klines[i];
      const timestamp = parseInt(k[0]);
      const openPrice = parseFloat(k[1]);
      const highPrice = parseFloat(k[2]);
      const lowPrice = parseFloat(k[3]);
      const closePrice = parseFloat(k[4]);
      const volume = parseFloat(k[7]);
      const dateObj = new Date(timestamp);
      const dateStr = dateObj.toLocaleDateString('zh-CN');

      // 计算当天的开始和结束时间戳
      const dayStartTs = timestamp;
      const dayEndTs = dayStartTs + 24 * 60 * 60 * 1000;

      // 在详细K线中查找匹配的高低点时间
      let highTimeStr = '-';
      let lowTimeStr = '-';

      if (detailedCandles && detailedCandles.length > 0) {
        // 1. 筛选出属于这一天的详细K线
        const dayCandles = detailedCandles.filter(dk => {
          const t = parseInt(dk[0]);
          return t >= dayStartTs && t < dayEndTs;
        });

        // 2. 对筛选出的K线按时间正序排序 (OKX返回的是倒序)
        dayCandles.sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

        if (dayCandles.length > 0) {
          let maxHigh = -Infinity;
          let maxHighTs = 0;
          let minLow = Infinity;
          let minLowTs = 0;

          dayCandles.forEach(dk => {
            const h = parseFloat(dk[2]);
            const l = parseFloat(dk[3]);
            const t = parseInt(dk[0]);

            // 找最高价
            if (h > maxHigh) {
              maxHigh = h;
              maxHighTs = t;
            }

            // 找最低价
            if (l < minLow) {
              minLow = l;
              minLowTs = t;
            }
          });

          // 格式化时间 HH:mm
          const formatTime = (ts) => {
            if (!ts) return '-';
            const d = new Date(ts);
            const hours = d.getHours().toString().padStart(2, '0');
            const minutes = d.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
          };

          highTimeStr = formatTime(maxHighTs);
          lowTimeStr = formatTime(minLowTs);
        }
      }

      if (i === 0) firstOpenPrice = openPrice;

      let dailyChange = 0;
      if (i === 0) {
        dailyChange = ((closePrice - openPrice) / openPrice) * 100;
      } else {
        dailyChange = ((closePrice - prevClosePrice) / prevClosePrice) * 100;
      }

      // 计算最高/最低价相对开盘价的涨跌幅
      const highChangePercent = ((highPrice - openPrice) / openPrice) * 100;
      const lowChangePercent = ((lowPrice - openPrice) / openPrice) * 100;

      // 计算振幅: (最高-最低) / 昨收 (第一天用开盘)
      let amplitude = 0;
      const basePrice = (i === 0) ? openPrice : prevClosePrice;
      if (basePrice > 0) {
        amplitude = ((highPrice - lowPrice) / basePrice) * 100;
      }

      const cumulativeChange = ((closePrice - firstOpenPrice) / firstOpenPrice) * 100;

      // 获取当天的 OI
      let oi = null;
      if (oiMap && oiMap[timestamp]) {
        oi = oiMap[timestamp];
      }

      historyData.push({
        date: dateStr,
        openPrice: openPrice.toFixed(this.currentPrecision),
        highPrice: highPrice.toFixed(this.currentPrecision),
        lowPrice: lowPrice.toFixed(this.currentPrecision),
        closePrice: closePrice.toFixed(this.currentPrecision),
        volume: volume,
        oi: oi, // 新增 OI 字段
        amplitude: amplitude.toFixed(2),
        dailyChange: dailyChange.toFixed(2),
        cumulativeChange: cumulativeChange.toFixed(2),
        highChangePercent: highChangePercent.toFixed(2),
        lowChangePercent: lowChangePercent.toFixed(2),
        highTime: highTimeStr,
        lowTime: lowTimeStr
      });

      prevClosePrice = closePrice;
    }

    return historyData;
  }

  displayHistoryResults(historyData) {
    console.log('开始显示历史结果, 数据长度:', historyData.length);

    if (!historyData.length) return;

    const firstOpen = parseFloat(historyData[0].openPrice);
    const lastClose = parseFloat(historyData[historyData.length - 1].closePrice);
    const totalChange = ((lastClose - firstOpen) / firstOpen) * 100;

    const changes = historyData.map(d => parseFloat(d.dailyChange));
    const positiveCount = changes.filter(c => c > 0).length;
    const negativeCount = changes.filter(c => c < 0).length;
    const maxDaily = Math.max(...changes);
    const minDaily = Math.min(...changes);

    // 显示汇总信息
    const summaryEl = document.getElementById('historySummary');
    summaryEl.innerHTML = `
      <div class="summary-info">
        <h4>统计汇总（${historyData.length}天）</h4>
        <div class="summary-grid">
          <div class="summary-item">
            <span>起始价格:</span>
            <strong>${firstOpen.toFixed(this.currentPrecision)}</strong>
          </div>
          <div class="summary-item">
            <span>结束价格:</span>
            <strong>${lastClose.toFixed(this.currentPrecision)}</strong>
          </div>
          <div class="summary-item">
            <span>总涨跌幅:</span>
            <strong class="${totalChange >= 0 ? 'positive' : 'negative'}">
              ${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(2)}%
            </strong>
          </div>
          <div class="summary-item">
            <span>上涨天数:</span>
            <strong class="positive">${positiveCount}天</strong>
          </div>
          <div class="summary-item">
            <span>下跌天数:</span>
            <strong class="negative">${negativeCount}天</strong>
          </div>
          <div class="summary-item">
            <span>最大单日涨幅:</span>
            <strong class="positive">+${maxDaily.toFixed(2)}%</strong>
          </div>
          <div class="summary-item">
            <span>最大单日跌幅:</span>
            <strong class="negative">${minDaily.toFixed(2)}%</strong>
          </div>
        </div>
      </div>
    `;
    summaryEl.style.display = 'block';

    // 准备 DataTables 数据 - 增加时间列
    const tableData = historyData.map(data => {
      const dailyChangeClass = parseFloat(data.dailyChange) >= 0 ? 'positive' : 'negative';
      const dailyChangePrefix = parseFloat(data.dailyChange) >= 0 ? '+' : '';

      const cumulativeChangeClass = parseFloat(data.cumulativeChange) >= 0 ? 'positive' : 'negative';
      const cumulativeChangePrefix = parseFloat(data.cumulativeChange) >= 0 ? '+' : '';

      const highChangeClass = parseFloat(data.highChangePercent) >= 0 ? 'positive' : 'negative';
      const highChangePrefix = parseFloat(data.highChangePercent) >= 0 ? '+' : '';

      const lowChangeClass = parseFloat(data.lowChangePercent) >= 0 ? 'positive' : 'negative';
      const lowChangePrefix = parseFloat(data.lowChangePercent) >= 0 ? '+' : '';

      return [
        data.date,
        data.openPrice,
        `${data.closePrice} <span class="sub-info inline ${dailyChangeClass}">(${dailyChangePrefix}${data.dailyChange}%)</span>`,
        `${data.highPrice} <span class="sub-info inline ${highChangeClass}">(${data.highTime}/${highChangePrefix}${data.highChangePercent}%)</span>`,
        `${data.lowPrice} <span class="sub-info inline ${lowChangeClass}">(${data.lowTime}/${lowChangePrefix}${data.lowChangePercent}%)</span>`,
        `${data.amplitude}%`,
        this.formatVolume(data.volume),
        data.oi ? this.formatVolume(data.oi) : '-',
        `<span class="${cumulativeChangeClass}">${cumulativeChangePrefix}${data.cumulativeChange}%</span>`
      ];
    });

    if (this.historyTable) {
      this.historyTable.destroy();
      this.historyTable = null;
    }

    const historyResults = document.getElementById('historyResults');
    const historyTable = document.getElementById('historyTable');

    historyResults.style.display = 'block';
    historyTable.style.display = 'table';

    try {
      this.historyTable = $('#historyTable').DataTable({
        data: tableData,
        paging: false,
        searching: false,
        info: false,
        ordering: false,
        scrollY: window.innerWidth >= 1024 ? '500px' : '400px',
        scrollX: true,
        scrollCollapse: true,
        responsive: false,
        columnDefs: [{
          targets: '_all',
          className: 'text-center'
        }
        ],
        language: {
          emptyTable: '暂无数据'
        }
      });
    } catch (err) {
      console.error('DataTable初始化失败:', err);
      this.fallbackTableDisplay(historyData);
    }
  }

  // 回退表格显示方法
  fallbackTableDisplay(historyData) {
    const historyResults = document.getElementById('historyResults');

    let tableHTML = `
      <div class="history-results">
        <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e1e5e9; border-radius: 6px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #e5e7eb; position: sticky; top: 0;">
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">日期</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">开盘</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">收盘</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">最高</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">最低</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">振幅</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">成交额</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">持仓量(OI)</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">累计涨跌幅</th>
              </tr>
            </thead>
            <tbody>
    `;

    historyData.forEach(data => {
      const dailyChangeClass = parseFloat(data.dailyChange) >= 0 ? 'positive' : 'negative';
      const dailyChangePrefix = parseFloat(data.dailyChange) >= 0 ? '+' : '';

      const cumulativeChangeClass = parseFloat(data.cumulativeChange) >= 0 ? 'positive' : 'negative';
      const cumulativeChangePrefix = parseFloat(data.cumulativeChange) >= 0 ? '+' : '';

      tableHTML += `
        <tr style="border-bottom: 1px solid #e1e5e9;">
          <td style="padding: 8px 6px; text-align: center;">${data.date}</td>
          <td style="padding: 8px 6px; text-align: center;">${data.openPrice}</td>
          <td style="padding: 8px 6px; text-align: center;">
            ${data.closePrice} <span class="sub-info inline ${dailyChangeClass}">(${dailyChangePrefix}${data.dailyChange}%)</span>
          </td>
          <td style="padding: 8px 6px; text-align: center;">
            ${data.highPrice} <span class="sub-info inline ${highChangeClass}">(${data.highTime}/${highChangePrefix}${data.highChangePercent}%)</span>
          </td>
          <td style="padding: 8px 6px; text-align: center;">
            ${data.lowPrice} <span class="sub-info inline ${lowChangeClass}">(${data.lowTime}/${lowChangePrefix}${data.lowChangePercent}%)</span>
          </td>
          <td style="padding: 8px 6px; text-align: center;">${data.amplitude}%</td>
          <td style="padding: 8px 6px; text-align: center;">${this.formatVolume(data.volume)}</td>
          <td style="padding: 8px 6px; text-align: center;">${data.oi ? this.formatVolume(data.oi) : '-'}</td>
          <td style="padding: 8px 6px; text-align: center;"><span class="${cumulativeChangeClass}">${cumulativeChangePrefix}${data.cumulativeChange}%</span></td>
        </tr>
      `;
    });

    tableHTML += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    historyResults.innerHTML = tableHTML;
    historyResults.style.display = 'block';
  }

  // 启动自动更新 - 分离价格、资金费率和持仓更新
  startAutoUpdate() {
    // 清理旧定时器
    if (this.tickerInterval) clearInterval(this.tickerInterval);
    if (this.fundingRateInterval) clearInterval(this.fundingRateInterval);
    if (this.positionInterval) clearInterval(this.positionInterval);

    const symbol = this.currentData.symbol;

    // 每 10 秒更新价格
    this.tickerInterval = setInterval(async () => {
      try {
        const resp = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}`);
        const data = await resp.json();
        if (data.code === '0' && data.data?.length) {
          const newPrice = parseFloat(data.data[0].last);
          this.currentData.currentPrice = newPrice;
          this.updatePriceDisplay();
          this.calculate();
        }
      } catch (e) {
        console.warn('实时价格刷新失败：', e);
      }
    }, 10000);

    // 每 30 秒更新资金费率
    this.fundingRateInterval = setInterval(async () => {
      try {
        const fundingRate = await this.fetchFundingRate(symbol);
        if (fundingRate !== null) {
          this.currentFundingRate = fundingRate;
          this.updatePriceDisplay();
        }
      } catch (e) {
        console.warn('资金费率刷新失败：', e);
      }
    }, 30000);

    // 仅当配置了API时，才启动持仓轮询
    if (this.apiConfig) {
      this.positionInterval = setInterval(async () => {
        // 二次检查，防止运行中被清除配置
        if (this.apiConfig) {
          try {
            await this.fetchPositionData();
          } catch (e) {
            console.warn('持仓数据刷新失败：', e);
          }
        }
      }, 30000);
    }
  }

  updatePriceDisplay() {
    const priceInfo = document.getElementById('priceInfo');
    const {
      openPrice,
      highPrice,
      lowPrice,
      currentPrice
    } = this.currentData;

    if (openPrice !== null && currentPrice !== null && isFinite(openPrice) && isFinite(currentPrice)) {
      const dailyChangePercent = ((currentPrice - openPrice) / openPrice) * 100;

      // 确保精度值有效
      const precision = (this.currentPrecision && this.currentPrecision > 0) ? this.currentPrecision : 2;

      document.getElementById('openPrice').textContent = openPrice.toFixed(precision);
      document.getElementById('currentPrice').textContent = currentPrice.toFixed(precision);

      if (highPrice !== null && isFinite(highPrice)) {
        document.getElementById('highPrice').textContent = highPrice.toFixed(precision);
      }
      if (lowPrice !== null && isFinite(lowPrice)) {
        document.getElementById('lowPrice').textContent = lowPrice.toFixed(precision);
      }

      const dailyEl = document.getElementById('dailyChange');
      dailyEl.textContent = `${dailyChangePercent >= 0 ? '+' : ''}${dailyChangePercent.toFixed(2)}%`;
      dailyEl.className = dailyChangePercent >= 0 ? 'positive' : 'negative';

      // 显示资金费率
      const fundingRateEl = document.getElementById('fundingRate');
      if (this.currentFundingRate !== null) {
        const rate = parseFloat(this.currentFundingRate);
        fundingRateEl.textContent = `${rate >= 0 ? '+' : ''}${rate}%`;
        fundingRateEl.className = rate >= 0 ? 'positive' : 'negative';
      } else {
        fundingRateEl.textContent = 'N/A';
        fundingRateEl.className = 'neutral';
      }

      priceInfo.style.display = 'flex';
    } else {
      priceInfo.style.display = 'none';
    }
  }

  // 从期望幅度推期望点位（相对持仓）
  updateTargetPriceFromPercent() {
    const holdPrice = parseFloat(document.getElementById('holdPrice').value);
    const targetPercent = parseFloat(document.getElementById('targetPercent').value);
    const isContract = this.positionType !== 'spot';
    const leverage = isContract ? Math.max(1, parseFloat(document.getElementById('leverageInput')?.value) || this.leverage || 1) : 1;

    if (isFinite(holdPrice) && isFinite(targetPercent)) {
      // 期望幅度为保证金收益率 (ROE%)，实际币价变动幅度 = ROE% / 杠杆
      const priceChangePct = targetPercent / leverage;
      let targetPrice;
      if (this.positionType === 'short') {
        targetPrice = holdPrice * (1 - priceChangePct / 100);
      } else {
        targetPrice = holdPrice * (1 + priceChangePct / 100);
      }
      document.getElementById('targetPrice').value = targetPrice.toFixed(this.currentPrecision);
    }
  }

  // 从期望点位推期望幅度（相对持仓）
  updateTargetPercentFromPrice() {
    const holdPrice = parseFloat(document.getElementById('holdPrice').value);
    const targetPrice = parseFloat(document.getElementById('targetPrice').value);
    const isContract = this.positionType !== 'spot';
    const leverage = isContract ? Math.max(1, parseFloat(document.getElementById('leverageInput')?.value) || this.leverage || 1) : 1;

    if (isFinite(holdPrice) && isFinite(targetPrice) && holdPrice !== 0) {
      let priceChangePct;
      if (this.positionType === 'short') {
        priceChangePct = ((holdPrice - targetPrice) / holdPrice) * 100;
      } else {
        priceChangePct = ((targetPrice - holdPrice) / holdPrice) * 100;
      }
      // 期望幅度 = 币价变动幅度 * 杠杆 (ROE%)
      const targetPercent = priceChangePct * leverage;
      document.getElementById('targetPercent').value = targetPercent.toFixed(2);
    }
  }

  // 当日涨跌幅预期：基于开盘价计算目标价，并联动持仓幅度
  updateFromDailyExpected() {
    const openPrice = this.currentData.openPrice;
    const holdPrice = parseFloat(document.getElementById('holdPrice').value);
    const dailyExpect = parseFloat(document.getElementById('dailyExpectPercent').value);
    const isContract = this.positionType !== 'spot';
    const leverage = isContract ? Math.max(1, parseFloat(document.getElementById('leverageInput')?.value) || this.leverage || 1) : 1;

    if (!isFinite(openPrice)) return;

    if (isFinite(dailyExpect)) {
      const targetPrice = openPrice * (1 + dailyExpect / 100);
      document.getElementById('targetPrice').value = targetPrice.toFixed(this.currentPrecision);
      if (isFinite(holdPrice) && holdPrice !== 0) {
        let priceChangePct;
        if (this.positionType === 'short') {
          priceChangePct = ((holdPrice - targetPrice) / holdPrice) * 100;
        } else {
          priceChangePct = ((targetPrice - holdPrice) / holdPrice) * 100;
        }
        const targetPercent = priceChangePct * leverage;
        document.getElementById('targetPercent').value = targetPercent.toFixed(2);
      }
    }
  }

  // 反推当日涨跌幅预期（当有开盘价与目标价时）
  updateDailyExpectFromTarget() {
    const openPrice = this.currentData.openPrice;
    const targetPrice = parseFloat(document.getElementById('targetPrice').value);
    if (!isFinite(openPrice) || !isFinite(targetPrice) || openPrice === 0) return;
    const dailyExpect = ((targetPrice - openPrice) / openPrice) * 100;
    document.getElementById('dailyExpectPercent').value = dailyExpect.toFixed(2);
  }

  calculate() {
    const holdPrice = parseFloat(document.getElementById('holdPrice').value);
    const {
      openPrice,
      currentPrice
    } = this.currentData;

    if (!isFinite(currentPrice)) {
      this.showMessage('请先获取价格数据', 'error');
      return;
    }
    if (!isFinite(holdPrice) || holdPrice <= 0) {
      this.showMessage('请输入有效的持仓价格', 'error');
      return;
    }

    const isContract = this.positionType !== 'spot';
    const leverage = isContract ? Math.max(1, parseFloat(document.getElementById('leverageInput')?.value) || this.leverage || 1) : 1;
    this.leverage = leverage;

    // 更新期望幅度 Input 的 Label 提示
    const targetPercentLabel = document.getElementById('targetPercentLabel');
    if (targetPercentLabel) {
      if (isContract) {
        targetPercentLabel.textContent = `期望幅度 (%)（ROE, ${leverage}x杠杆）`;
      } else {
        targetPercentLabel.textContent = `期望幅度 (%)（相对持仓价）`;
      }
    }

    // 期望值联动：按最后修改优先，其次使用可用字段推导
    const tpInput = parseFloat(document.getElementById('targetPrice').value);
    const tpctInput = parseFloat(document.getElementById('targetPercent').value);
    const dailyInput = parseFloat(document.getElementById('dailyExpectPercent').value);

    let finalTargetPrice = null;
    let finalTargetRoe = null;
    let targetPriceChangePct = null;
    let targetVsOpen = null;

    const hasOpen = openPrice !== null && isFinite(openPrice);

    const computeFromDaily = () => {
      if (hasOpen && isFinite(dailyInput)) {
        finalTargetPrice = openPrice * (1 + dailyInput / 100);
        if (this.positionType === 'short') {
          targetPriceChangePct = ((holdPrice - finalTargetPrice) / holdPrice) * 100;
        } else {
          targetPriceChangePct = ((finalTargetPrice - holdPrice) / holdPrice) * 100;
        }
        finalTargetRoe = targetPriceChangePct * leverage;
        targetVsOpen = dailyInput;
      }
    };

    const computeFromPercent = () => {
      if (isFinite(tpctInput)) {
        finalTargetRoe = tpctInput;
        targetPriceChangePct = tpctInput / leverage;
        if (this.positionType === 'short') {
          finalTargetPrice = holdPrice * (1 - targetPriceChangePct / 100);
        } else {
          finalTargetPrice = holdPrice * (1 + targetPriceChangePct / 100);
        }
        if (hasOpen) targetVsOpen = ((finalTargetPrice - openPrice) / openPrice) * 100;
      }
    };

    const computeFromPrice = () => {
      if (isFinite(tpInput)) {
        finalTargetPrice = tpInput;
        if (this.positionType === 'short') {
          targetPriceChangePct = ((holdPrice - tpInput) / holdPrice) * 100;
        } else {
          targetPriceChangePct = ((tpInput - holdPrice) / holdPrice) * 100;
        }
        finalTargetRoe = targetPriceChangePct * leverage;
        if (hasOpen) targetVsOpen = ((tpInput - openPrice) / openPrice) * 100;
      }
    };

    // 优先使用最后修改来源
    if (this.lastModified === 'daily') computeFromDaily();
    else if (this.lastModified === 'percent') computeFromPercent();
    else if (this.lastModified === 'price') computeFromPrice();

    if (finalTargetPrice === null || !isFinite(finalTargetPrice)) {
      if (isFinite(dailyInput) && hasOpen) computeFromDaily();
      else if (isFinite(tpInput)) computeFromPrice();
      else if (isFinite(tpctInput)) computeFromPercent();
    }

    this.hideMessage();
  }

  showMessage(text, type = 'error') {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = 'block';
  }

  hideMessage() {
    document.getElementById('message').style.display = 'none';
  }
}

// 初始化计算器
new Calculator();