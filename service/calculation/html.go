package calculation

var HtmlPage = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>合约收益计算器</title>
    <style>
        table { border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #aaa; padding: 5px; text-align: center; }
        input { width: 80px; }
    </style>
</head>
<body>
    <h2>合约收益计算器</h2>
    <button onclick="addRow()">添加交易记录</button>
    <table id="tradeTable">
        <thead>
            <tr>
                <th>操作</th>
                <th>价格</th>
                <th>数量</th>
                <th>杠杆</th>
                <th>方向</th>
                <th>操作</th>
            </tr>
        </thead>
        <tbody></tbody>
    </table>
    <br>
    <button onclick="calc()">计算</button>
    <h3>结果</h3>
    <pre id="output"></pre>
    <h3>收益明细</h3>
    <table id="detailTable">
        <thead>
            <tr>
                <th>平仓价格</th>
                <th>平仓数量</th>
                <th>单次收益</th>
                <th>累计收益</th>
            </tr>
        </thead>
        <tbody></tbody>
    </table>

<script>
function addRow() {
    const tbody = document.querySelector("#tradeTable tbody");
    const row = document.createElement("tr");

    row.innerHTML =
        '<td>' +
            '<select>' +
                '<option value="open">开仓/加仓</option>' +
                '<option value="close">平仓</option>' +
            '</select>' +
        '</td>' +
        '<td><input type="number" step="0.01" placeholder="价格"></td>' +
        '<td><input type="number" step="0.01" placeholder="数量"></td>' +
        '<td><input type="number" value="5"></td>' +
        '<td>' +
            '<select>' +
                '<option value="long">long</option>' +
                '<option value="short">short</option>' +
            '</select>' +
        '</td>' +
        '<td><button onclick="this.parentElement.parentElement.remove()">删除</button></td>';

    tbody.appendChild(row);
}

async function calc() {
    const rows = document.querySelectorAll("#tradeTable tbody tr");
    let trades = [];
    rows.forEach(row => {
        const inputs = row.querySelectorAll("input, select");
        let operation = inputs[0].value;
        let price = parseFloat(inputs[1].value);
        let amount = parseFloat(inputs[2].value);
        let leverage = parseInt(inputs[3].value);
        let direction = inputs[4].value;
        if (!isNaN(price) && !isNaN(amount)) {
            trades.push({operation, price, amount, leverage, direction});
        }
    });

    if (trades.length === 0) {
        alert("请先录入交易记录");
        return;
    }

    let resp = await fetch("/calc", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(trades)
    });
    let result = await resp.json();
    document.getElementById("output").textContent = JSON.stringify(result, null, 2);

    // 渲染明细表格
    const detailBody = document.querySelector("#detailTable tbody");
    detailBody.innerHTML = "";
    result.details.forEach(d => {
        let tr = document.createElement("tr");
        tr.innerHTML =
            "<td>" + d.close_price + "</td>" +
            "<td>" + d.quantity + "</td>" +
            "<td>" + d.pnl.toFixed(2) + "</td>" +
            "<td>" + d.total_pnl.toFixed(2) + "</td>";
        detailBody.appendChild(tr);
    });
}
</script>
</body>
</html>
`
