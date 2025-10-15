document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/calculate';

    // DOM 元素
    const operationSelect = document.getElementById('operation');
    const priceInput = document.getElementById('price');
    const quantityInput = document.getElementById('quantity');
    const addOpBtn = document.getElementById('add-op-btn');
    const calculateAllBtn = document.getElementById('calculate-all-btn');
    const resetBtn = document.getElementById('reset-btn');
    const pendingOpsTableBody = document.querySelector('#pending-ops-table tbody');
    const resultsTableBody = document.querySelector('#results-table tbody');
    const errorMessageDiv = document.getElementById('error-message');
    const realtimeStatusDiv = document.getElementById('realtime-status-display');

    let operationQueue = [];

    // --- 核心修正 1: 将计算逻辑抽离成独立函数 ---
    async function handleCalculationRequest() {
        if (operationQueue.length === 0) return;

        hideError();
        calculateAllBtn.disabled = true;
        calculateAllBtn.textContent = '计算中...';

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(operationQueue),
            });
            const resultData = await response.json();
            if (!response.ok) {
                throw new Error(resultData.error || '计算失败');
            }
            renderResults(resultData);
        } catch (error) {
            showError(error.message);
            // 如果出错，且不是因为平仓，则重新启用按钮
            const lastOp = operationQueue[operationQueue.length - 1];
            if (!lastOp || lastOp.operation !== "close") {
                calculateAllBtn.disabled = false;
                calculateAllBtn.textContent = '计算收益';
            }
        }
    }

    // --- 核心修正 2: 绑定按钮点击事件到新函数 ---
    calculateAllBtn.addEventListener('click', handleCalculationRequest);

    // "添加操作" 按钮事件
    addOpBtn.addEventListener('click', () => {
        hideError();
        const operation = operationSelect.value;
        const price = parseFloat(priceInput.value);
        const quantity = operation === 'close' ? 0 : parseFloat(quantityInput.value);

        if (operationQueue.length === 0 && operation !== 'open') {
            showError("第一个操作必须是 '开仓'"); return;
        }
        if (operationQueue.length > 0 && operation === 'open') {
            showError("'开仓' 只能是第一个操作"); return;
        }
        if (isNaN(price) || price <= 0) {
            showError("请输入有效的价格"); return;
        }
        if (operation !== 'close' && (isNaN(quantity) || quantity <= 0)) {
            showError("请输入有效的数量(USDT)"); return;
        }

        operationQueue.push({ operation, price, quantity });
        renderPendingOps();

        priceInput.value = '';
        quantityInput.value = '';
        priceInput.focus();

        // --- 核心修正 3: 添加平仓后，直接调用计算函数 ---
        if (operation === 'close') {
            handleCalculationRequest();
        }
    });

    // "全部重置" 按钮事件
    resetBtn.addEventListener('click', () => {
        operationQueue = [];
        pendingOpsTableBody.innerHTML = '';
        resultsTableBody.innerHTML = '';
        realtimeStatusDiv.style.display = 'none';
        hideError();
        // 重置后按钮应禁用
        calculateAllBtn.disabled = true;
        calculateAllBtn.textContent = '计算收益';
    });

    function renderPendingOps() {
        pendingOpsTableBody.innerHTML = '';
        operationQueue.forEach((op, index) => {
            const row = pendingOpsTableBody.insertRow();
            row.innerHTML = `<td>${translateOperation(op.operation)}</td>
                           <td>${op.price.toFixed(4)}</td>
                           <td>${op.operation !== 'close' ? op.quantity.toFixed(2) : 'N/A'}</td>
                           <td><button class="btn-remove" data-index="${index}">移除</button></td>`;
        });

        document.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                operationQueue.splice(parseInt(e.target.dataset.index, 10), 1);
                renderPendingOps();
            });
        });

        calculateAndDisplayRealtimeStatus();

        // --- 核心修正 4: 简化此处的按钮状态管理 ---
        const lastOp = operationQueue.length > 0 ? operationQueue[operationQueue.length - 1] : null;
        // 只有当操作列表不为空且最后一个操作不是平仓时，计算按钮才可用
        calculateAllBtn.disabled = operationQueue.length === 0 || (lastOp && lastOp.operation === 'close');
    }

    function calculateAndDisplayRealtimeStatus() {
        if (operationQueue.length === 0) {
            realtimeStatusDiv.style.display = 'none';
            return;
        }
        let totalInvestedUSDT = 0, totalCryptoAmount = 0, averagePrice = 0;
        for (const op of operationQueue) {
            if (op.operation === "close") break;
            const cryptoAmount = op.quantity / op.price;
            switch(op.operation) {
                case "open":
                    totalInvestedUSDT = op.quantity; totalCryptoAmount = cryptoAmount; break;
                case "add":
                    totalInvestedUSDT += op.quantity; totalCryptoAmount += cryptoAmount; break;
                case "reduce":
                    // 必须先知道减仓前的均价
                    if (totalCryptoAmount > 0) {
                        const preReduceAvgPrice = totalInvestedUSDT / totalCryptoAmount;
                        totalCryptoAmount -= cryptoAmount;
                        totalInvestedUSDT = totalCryptoAmount * preReduceAvgPrice;
                    }
                    break;
            }
        }
        if (totalCryptoAmount > 0) { averagePrice = totalInvestedUSDT / totalCryptoAmount; }
        else { averagePrice = 0; totalInvestedUSDT = 0; }

        if (totalCryptoAmount > 0) {
            realtimeStatusDiv.innerHTML = `当前持仓预览: 均价 <span>${averagePrice.toFixed(4)}</span> | 总持仓 <span>${totalInvestedUSDT.toFixed(2)} USDT</span>`;
            realtimeStatusDiv.style.display = 'block';
        } else {
            realtimeStatusDiv.style.display = 'none';
        }
    }

    function renderResults(results) {
        resultsTableBody.innerHTML = '';
        results.forEach(res => {
            const row = resultsTableBody.insertRow();
            const pnl = res.realizedPnl;
            const pnlClass = pnl > 0 ? 'pnl-positive' : pnl < 0 ? 'pnl-negative' : '';
            row.innerHTML = `
                <td>${translateOperation(res.operation)} (价格: ${res.inputPrice.toFixed(4)})</td>
                <td class="${pnlClass}">${pnl.toFixed(4)}</td>
                <td>${res.averagePrice > 0 ? res.averagePrice.toFixed(4) : 'N/A'}</td>
                <td>${res.totalInvestedUSDT.toFixed(2)}</td>
                <td>${res.message}</td>
            `;
        });
    }

    // 辅助函数 (无修改)
    operationSelect.addEventListener('change', () => {
        quantityInput.disabled = operationSelect.value === 'close';
        if (quantityInput.disabled) { quantityInput.value = ''; quantityInput.placeholder = '平仓无需数量'; }
        else { quantityInput.placeholder = '例如: 1000.50'; }
    });
    function showError(message) { errorMessageDiv.textContent = `错误: ${message}`; errorMessageDiv.style.display = 'block'; }
    function hideError() { errorMessageDiv.style.display = 'none'; }
    function translateOperation(op) { const map = { 'open': '开仓', 'add': '加仓', 'reduce': '减仓', 'close': '平仓' }; return map[op] || op; }

    // 初始化调用
    renderPendingOps();
});