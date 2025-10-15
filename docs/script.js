class Calculator {
  constructor() {
    this.currentData = {
      openPrice: null,
      highPrice: null,
      lowPrice: null,
      currentPrice: null,
      symbol: 'BTC-USDT'
    };
    this.lastModified = null; // 'percent' | 'price' | 'daily'
    this.tickerInterval = null;
    this.fundingRateInterval = null; // 新增：资金费率更新定时器
    this.currentPrecision = 2; // 默认精度
    this.symbolInputTimeout = null; // 防抖定时器
    this.isLoadingPrice = false; // 防止重复请求
    this.isLoadingHistory = false; // 防止重复请求
    this.historyTable = null; // DataTables 实例
    this.currentFundingRate = null; // 当前资金费率
    this.init();
  }

  init() {
    this.bindEvents();
    this.fetchPriceData(); // 页面加载时自动获取 BTC-USDT
  }

  bindEvents() {
    // 币种输入自动获取（防抖）
    document.getElementById('symbol').addEventListener('input', (e) => {
      const symbol = e.target.value.trim();
      
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
    this.currentData = { openPrice: null, highPrice: null, lowPrice: null, currentPrice: null, symbol: '' };
    this.currentFundingRate = null;
    document.getElementById('priceInfo').style.display = 'none';
    document.getElementById('precisionDisplay').style.display = 'none';
    document.getElementById('historySummary').style.display = 'none';
    document.getElementById('historyResults').style.display = 'none';
    document.getElementById('results').style.display = 'none';
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
      this.updatePrecisionDisplay();
      this.showMessage(`已自动设置价格精度为 ${detectedPrecision} 位小数`, 'success');
      
      // 延迟一下再隐藏消息，让用户能看到
      setTimeout(() => {
        if (document.getElementById('message').textContent.includes('已自动设置价格精度')) {
          this.hideMessage();
        }
      }, 2000);
    } else {
      this.updatePrecisionDisplay();
    }
  }

  // 更新精度显示
  updatePrecisionDisplay() {
    const precisionDisplay = document.getElementById('precisionDisplay');
    const precisionValue = document.getElementById('precisionValue');
    
    precisionValue.textContent = `${this.currentPrecision}位小数`;
    precisionDisplay.style.display = 'flex';
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
      // 将现货交易对转换为永续合约
      const swapSymbol = symbol.replace('-', '-') + '-SWAP';
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
    const symbol = document.getElementById('symbol').value.trim();
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
      const klineResp = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=1D&limit=1`);
      const klineData = await klineResp.json();

      // 获取最新 ticker（当前价）
      const tickerResp = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}`);
      const tickerData = await tickerResp.json();

      if (klineData.code !== '0' || tickerData.code !== '0' || !klineData.data?.length || !tickerData.data?.length) {
        throw new Error('获取价格数据失败，请检查币种格式或稍后重试');
      }

      const k = klineData.data[0];
      const openPrice = parseFloat(k[1]); // 开盘
      const highPrice = parseFloat(k[2]); // 当日高
      const lowPrice  = parseFloat(k[3]); // 当日低
      const currentPrice = parseFloat(tickerData.data[0].last);

      this.currentData = { openPrice, highPrice, lowPrice, currentPrice, symbol };

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

    } catch (err) {
      console.error(err);
      this.showMessage(err.message || 'API调用失败，请检查网络或币种格式', 'error');
      this.currentData = { openPrice: null, highPrice: null, lowPrice: null, currentPrice: null, symbol };
      this.updatePriceDisplay();
    } finally {
      this.isLoadingPrice = false;
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
      // 获取历史K线数据
      const resp = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=1D&limit=${days}`);
      const data = await resp.json();

      console.log('历史数据API响应:', data); // 调试信息

      if (data.code !== '0' || !data.data?.length) {
        throw new Error('获取历史数据失败，请检查币种格式或稍后重试');
      }

      // 数据是按时间倒序的，需要反转为正序，并只取需要的天数
      const klines = data.data.slice(0, days).reverse();
      
      console.log('处理后的K线数据长度:', klines.length); // 调试信息
      
      // 收集所有价格用于精度检测
      const allPrices = [];
      klines.forEach(k => {
        allPrices.push(parseFloat(k[1]), parseFloat(k[2]), parseFloat(k[3]), parseFloat(k[4]));
      });
      
      // 如果还没有当前价格数据，也从历史数据中自动设置精度
      if (!this.currentData.currentPrice) {
        this.autoSetPrecision(allPrices);
      }
      
      const historyData = this.processHistoryData(klines);
      console.log('处理后的历史数据:', historyData); // 调试信息
      
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

  processHistoryData(klines) {
    const historyData = [];
    let prevClosePrice = null;
    let firstOpenPrice = null; // 用于计算相对初始天数的涨跌幅

    for (let i = 0; i < klines.length; i++) {
      const k = klines[i];
      const timestamp = parseInt(k[0]);
      const openPrice = parseFloat(k[1]);
      const highPrice = parseFloat(k[2]);
      const lowPrice = parseFloat(k[3]);
      const closePrice = parseFloat(k[4]);
      const volume = parseFloat(k[7]); // 修改：使用 volCcyQuote (k[7])
      const date = new Date(timestamp).toLocaleDateString('zh-CN');

      // 记录第一天的开盘价
      if (i === 0) {
        firstOpenPrice = openPrice;
      }

      // 计算当日涨跌幅
      let dailyChange = 0;
      if (i === 0) {
        // 第一天：相对开盘价的涨跌幅
        dailyChange = ((closePrice - openPrice) / openPrice) * 100;
      } else {
        // 其他天：相对前一天收盘价的涨跌幅
        dailyChange = ((closePrice - prevClosePrice) / prevClosePrice) * 100;
      }

      // 计算相对初始天数的涨跌幅
      const cumulativeChange = ((closePrice - firstOpenPrice) / firstOpenPrice) * 100;

      historyData.push({
        date,
        openPrice: openPrice.toFixed(this.currentPrecision),
        highPrice: highPrice.toFixed(this.currentPrecision),
        lowPrice: lowPrice.toFixed(this.currentPrecision),
        closePrice: closePrice.toFixed(this.currentPrecision),
        volume: this.formatVolume(volume), // 格式化交易量
        dailyChange: dailyChange.toFixed(2),
        cumulativeChange: cumulativeChange.toFixed(2)
      });

      prevClosePrice = closePrice;
    }

    return historyData;
  }

  displayHistoryResults(historyData) {
    console.log('开始显示历史结果, 数据长度:', historyData.length); // 调试信息
    
    if (!historyData.length) {
      console.log('没有历史数据，返回');
      return;
    }

    const firstOpen = parseFloat(historyData[0].openPrice);
    const lastClose = parseFloat(historyData[historyData.length - 1].closePrice);
    const totalChange = ((lastClose - firstOpen) / firstOpen) * 100;

    // 计算统计数据
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

    // 准备 DataTables 数据 - 添加交易量列
    const tableData = historyData.map(data => {
      const dailyChangeClass = parseFloat(data.dailyChange) >= 0 ? 'positive' : 'negative';
      const dailyChangePrefix = parseFloat(data.dailyChange) >= 0 ? '+' : '';
      
      const cumulativeChangeClass = parseFloat(data.cumulativeChange) >= 0 ? 'positive' : 'negative';
      const cumulativeChangePrefix = parseFloat(data.cumulativeChange) >= 0 ? '+' : '';
      
      return [
        data.date,
        data.openPrice,
        data.highPrice,
        data.lowPrice,
        data.closePrice,
        data.volume, // 交易量
        `<span class="${dailyChangeClass}">${dailyChangePrefix}${data.dailyChange}%</span>`,
        `<span class="${cumulativeChangeClass}">${cumulativeChangePrefix}${data.cumulativeChange}%</span>`
      ];
    });

    console.log('表格数据准备完成，行数:', tableData.length); // 调试信息

    // 销毁现有的 DataTable 实例
    if (this.historyTable) {
      console.log('销毁现有DataTable');
      this.historyTable.destroy();
      this.historyTable = null;
    }

    // 确保表格和容器都是可见的
    const historyResults = document.getElementById('historyResults');
    const historyTable = document.getElementById('historyTable');
    
    console.log('设置容器和表格可见');
    historyResults.style.display = 'block';
    historyTable.style.display = 'table'; // 修复：显示表格

    try {
      console.log('开始初始化DataTable');
      // 创建新的 DataTable
      this.historyTable = $('#historyTable').DataTable({
        data: tableData,
        paging: false,
        searching: false,
        info: false,
        ordering: false,
        scrollY: window.innerWidth >= 1024 ? '500px' : (window.innerWidth >= 768 ? '400px' : '350px'),
        scrollX: true, // 启用水平滚动以适应更多列
        scrollCollapse: true,
        responsive: false,
        columnDefs: [
          { targets: '_all', className: 'text-center' }
        ],
        language: {
          emptyTable: '暂无数据'
        }
      });
      console.log('DataTable初始化完成');
    } catch (err) {
      console.error('DataTable初始化失败:', err);
      // 如果DataTable初始化失败，回退到普通表格显示
      this.fallbackTableDisplay(historyData);
    }
  }

  // 回退表格显示方法（当DataTables失败时使用）
  fallbackTableDisplay(historyData) {
    console.log('使用回退表格显示方法');
    const historyResults = document.getElementById('historyResults');
    
    let tableHTML = `
      <div class="history-results">
        <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e1e5e9; border-radius: 6px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #e5e7eb; position: sticky; top: 0;">
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">日期</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">开盘</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">最高</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">最低</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">收盘</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">交易量</th>
                <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #d1d5db;">当日涨跌幅</th>
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
          <td style="padding: 8px 6px; text-align: center;">${data.highPrice}</td>
          <td style="padding: 8px 6px; text-align: center;">${data.lowPrice}</td>
          <td style="padding: 8px 6px; text-align: center;">${data.closePrice}</td>
          <td style="padding: 8px 6px; text-align: center;">${data.volume}</td>
          <td style="padding: 8px 6px; text-align: center;"><span class="${dailyChangeClass}">${dailyChangePrefix}${data.dailyChange}%</span></td>
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

  // 启动自动更新 - 分离价格和资金费率更新
  startAutoUpdate() {
    // 清理旧定时器
    if (this.tickerInterval) clearInterval(this.tickerInterval);
    if (this.fundingRateInterval) clearInterval(this.fundingRateInterval);
    
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
  }

  updatePriceDisplay() {
    const priceInfo = document.getElementById('priceInfo');
    const { openPrice, highPrice, lowPrice, currentPrice } = this.currentData;

    if (isFinite(openPrice) && isFinite(currentPrice)) {
      const dailyChangePercent = ((currentPrice - openPrice) / openPrice) * 100;

      document.getElementById('openPrice').textContent   = openPrice.toFixed(this.currentPrecision);
      document.getElementById('currentPrice').textContent = currentPrice.toFixed(this.currentPrecision);

      if (isFinite(highPrice)) document.getElementById('highPrice').textContent = highPrice.toFixed(this.currentPrecision);
      if (isFinite(lowPrice))  document.getElementById('lowPrice').textContent  = lowPrice.toFixed(this.currentPrecision);

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

      priceInfo.style.display = 'block';
    } else {
      priceInfo.style.display = 'none';
    }
  }

  // 从期望幅度推期望点位（相对持仓）
  updateTargetPriceFromPercent() {
    const holdPrice = parseFloat(document.getElementById('holdPrice').value);
    const targetPercent = parseFloat(document.getElementById('targetPercent').value);
    if (isFinite(holdPrice) && isFinite(targetPercent)) {
      const targetPrice = holdPrice * (1 + targetPercent / 100);
      document.getElementById('targetPrice').value = targetPrice.toFixed(this.currentPrecision);
    }
  }

  // 从期望点位推期望幅度（相对持仓）
  updateTargetPercentFromPrice() {
    const holdPrice = parseFloat(document.getElementById('holdPrice').value);
    const targetPrice = parseFloat(document.getElementById('targetPrice').value);
    if (isFinite(holdPrice) && isFinite(targetPrice) && holdPrice !== 0) {
      const targetPercent = ((targetPrice - holdPrice) / holdPrice) * 100;
      document.getElementById('targetPercent').value = targetPercent.toFixed(2);
    }
  }

  // 当日涨跌幅预期：基于开盘价计算目标价，并联动持仓幅度
  updateFromDailyExpected() {
    const openPrice = this.currentData.openPrice;
    const holdPrice = parseFloat(document.getElementById('holdPrice').value);
    const dailyExpect = parseFloat(document.getElementById('dailyExpectPercent').value);
    if (!isFinite(openPrice)) return;

    if (isFinite(dailyExpect)) {
      const targetPrice = openPrice * (1 + dailyExpect / 100);
      document.getElementById('targetPrice').value = targetPrice.toFixed(this.currentPrecision);
      if (isFinite(holdPrice) && holdPrice !== 0) {
        const targetPercent = ((targetPrice - holdPrice) / holdPrice) * 100;
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
    const { openPrice, currentPrice } = this.currentData;

    if (!isFinite(currentPrice)) {
      this.showMessage('请先获取价格数据', 'error');
      document.getElementById('results').style.display = 'none';
      return;
    }
    if (!isFinite(holdPrice) || holdPrice <= 0) {
      this.showMessage('请输入有效的持仓价格', 'error');
      document.getElementById('results').style.display = 'none';
      return;
    }

    // 当前持仓盈亏（相对当前价）
    const currentPnL = ((currentPrice - holdPrice) / holdPrice) * 100;

    let results = `
      <table>
        <thead><tr><th>项目</th><th>数值</th></tr></thead>
        <tbody>
          <tr>
            <td>当前持仓盈亏</td>
            <td class="${currentPnL >= 0 ? 'positive' : 'negative'}">
              ${currentPnL >= 0 ? '+' : ''}${currentPnL.toFixed(2)}%
            </td>
          </tr>
    `;

    // 期望值联动：按最后修改优先，其次使用可用字段推导
    const tpInput = parseFloat(document.getElementById('targetPrice').value);
    const tpctInput = parseFloat(document.getElementById('targetPercent').value);
    const dailyInput = parseFloat(document.getElementById('dailyExpectPercent').value);

    let finalTargetPrice = null;
    let finalTargetPercent = null;
    let targetVsOpen = null;

    const hasOpen = isFinite(openPrice);

    const computeFromDaily = () => {
      if (hasOpen && isFinite(dailyInput)) {
        finalTargetPrice = openPrice * (1 + dailyInput / 100);
        finalTargetPercent = ((finalTargetPrice - holdPrice) / holdPrice) * 100;
        targetVsOpen = dailyInput;
      }
    };
    const computeFromPercent = () => {
      if (isFinite(tpctInput)) {
        finalTargetPrice = holdPrice * (1 + tpctInput / 100);
        finalTargetPercent = tpctInput;
        if (hasOpen) targetVsOpen = ((finalTargetPrice - openPrice) / openPrice) * 100;
      }
    };
    const computeFromPrice = () => {
      if (isFinite(tpInput)) {
        finalTargetPrice = tpInput;
        finalTargetPercent = ((tpInput - holdPrice) / holdPrice) * 100;
        if (hasOpen) targetVsOpen = ((tpInput - openPrice) / openPrice) * 100;
      }
    };

    // 优先使用最后修改来源
    if (this.lastModified === 'daily') computeFromDaily();
    else if (this.lastModified === 'percent') computeFromPercent();
    else if (this.lastModified === 'price') computeFromPrice();
    // 若没有最后修改标记或对应数据缺失，回退尝试其他来源
    if (!isFinite(finalTargetPrice)) {
      if (isFinite(dailyInput) && hasOpen) computeFromDaily();
      else if (isFinite(tpInput)) computeFromPrice();
      else if (isFinite(tpctInput)) computeFromPercent();
    }

    if (isFinite(finalTargetPrice)) {
      results += `
        <tr>
          <td>目标价格</td>
          <td>${finalTargetPrice.toFixed(this.currentPrecision)}</td>
        </tr>
        <tr>
          <td>相对持仓价涨跌幅</td>
          <td class="${finalTargetPercent >= 0 ? 'positive' : 'negative'}">
            ${finalTargetPercent >= 0 ? '+' : ''}${finalTargetPercent.toFixed(2)}%
          </td>
        </tr>
      `;
      if (hasOpen && isFinite(targetVsOpen)) {
        results += `
          <tr>
            <td>相对开盘价涨跌幅</td>
            <td class="${targetVsOpen >= 0 ? 'positive' : 'negative'}">
              ${targetVsOpen >= 0 ? '+' : ''}${targetVsOpen.toFixed(2)}%
            </td>
          </tr>
        `;
      }
    }

    results += '</tbody></table>';
    document.getElementById('results').innerHTML = results;
    document.getElementById('results').style.display = 'block';
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