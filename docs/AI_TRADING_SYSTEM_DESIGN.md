# AI 加密貨幣交易系統 - 技術設計文件

## 1. 專案概述

### 1.1 專案目標
建立一個整合 AI 分析能力的加密貨幣自動交易系統，支援 OKX 交易所的現貨與合約交易。

### 1.2 核心功能
- **AI 市場分析**：使用 GPT 模型分析市場趨勢、技術指標，提供交易建議
- **自動交易執行**：根據策略自動下單、止損、止盈
- **投資組合追蹤**：即時追蹤持倉、損益、資產配置
- **風險管理**：倉位控制、最大虧損限制、槓桿管理

---

## 2. 系統架構

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Dashboard │  │ Trading  │  │ Portfolio│  │ Strategy Config  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │ REST API / WebSocket
┌─────────────────────────────┴───────────────────────────────────┐
│                        Backend (Node.js)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ API Gateway  │  │ Auth Service │  │ WebSocket Server     │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Trading      │  │ AI Analysis  │  │ Portfolio            │   │
│  │ Engine       │  │ Module       │  │ Manager              │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└────────┬────────────────────┬────────────────────┬──────────────┘
         │                    │                    │
    ┌────┴────┐          ┌────┴────┐          ┌────┴────┐
    │  OKX    │          │ OpenAI  │          │ Database│
    │  API    │          │  API    │          │ (SQLite)│
    └─────────┘          └─────────┘          └─────────┘
```

---

## 3. 技術棧

### 3.1 前端
| 技術 | 用途 |
|------|------|
| Next.js 14 | React 框架，SSR/CSR |
| TypeScript | 型別安全 |
| TailwindCSS | UI 樣式 |
| Chart.js / TradingView | K線圖表 |
| SWR | 資料獲取與快取 |
| Socket.io-client | 即時數據 |

### 3.2 後端
| 技術 | 用途 |
|------|------|
| Node.js + Express | API 服務器 |
| TypeScript | 型別安全 |
| Socket.io | WebSocket 即時通訊 |
| node-cron | 定時任務排程 |
| Winston | 日誌記錄 |

### 3.3 資料庫
| 技術 | 用途 |
|------|------|
| SQLite | 本地資料庫（輕量、無需額外設定）|
| Prisma | ORM |

### 3.4 外部服務
| 服務 | 用途 |
|------|------|
| OKX API | 交易所 API（現貨、合約、帳戶）|
| OpenAI API | AI 分析（GPT-4o）|

---

## 4. OKX API 整合

### 4.1 所需 API 權限
- **Read**: 讀取帳戶、持倉、市場數據
- **Trade**: 現貨交易
- **Futures**: 合約交易

### 4.2 主要 API 端點

#### 市場數據
```javascript
// 取得 K 線數據
GET /api/v5/market/candles?instId=BTC-USDT&bar=1H

// 取得即時價格
GET /api/v5/market/ticker?instId=BTC-USDT

// WebSocket 訂閱即時行情
ws://ws.okx.com:8443/ws/v5/public
```

#### 帳戶與交易
```javascript
// 取得帳戶餘額
GET /api/v5/account/balance

// 取得持倉
GET /api/v5/account/positions

// 下單（現貨）
POST /api/v5/trade/order
{
  "instId": "BTC-USDT",
  "tdMode": "cash",      // cash=現貨, cross=全倉, isolated=逐倉
  "side": "buy",
  "ordType": "limit",    // limit=限價, market=市價
  "sz": "0.01",
  "px": "50000"
}

// 下單（合約）
POST /api/v5/trade/order
{
  "instId": "BTC-USDT-SWAP",
  "tdMode": "cross",
  "side": "buy",
  "posSide": "long",     // long=做多, short=做空
  "ordType": "market",
  "sz": "1"
}
```

### 4.3 API 簽名機制
```javascript
const crypto = require('crypto');

function sign(timestamp, method, requestPath, body, secretKey) {
  const preHash = timestamp + method + requestPath + (body || '');
  return crypto.createHmac('sha256', secretKey)
    .update(preHash)
    .digest('base64');
}

// Headers
{
  'OK-ACCESS-KEY': apiKey,
  'OK-ACCESS-SIGN': signature,
  'OK-ACCESS-TIMESTAMP': timestamp,
  'OK-ACCESS-PASSPHRASE': passphrase
}
```

---

## 5. AI 分析模組

### 5.1 分析功能

#### 技術分析
```javascript
const technicalAnalysis = {
  // 分析 K 線形態
  analyzeCandlePatterns: (candles) => { ... },
  
  // 計算技術指標
  calculateIndicators: (candles) => {
    return {
      MA: calculateMA(candles, [7, 25, 99]),
      RSI: calculateRSI(candles, 14),
      MACD: calculateMACD(candles),
      BollingerBands: calculateBB(candles, 20)
    };
  }
};
```

#### GPT 市場解讀
```javascript
const prompt = `
你是一位專業的加密貨幣交易分析師。請根據以下數據分析 ${symbol} 的市場狀況：

技術指標：
- MA7: ${ma7}, MA25: ${ma25}, MA99: ${ma99}
- RSI(14): ${rsi}
- MACD: ${macd.value}, Signal: ${macd.signal}
- 布林帶: 上軌 ${bb.upper}, 中軌 ${bb.middle}, 下軌 ${bb.lower}

近期價格走勢：
${recentPrices}

請提供：
1. 當前趨勢判斷（多/空/盤整）
2. 重要支撐位和壓力位
3. 短期（1-3天）交易建議
4. 風險提示

請用 JSON 格式回覆。
`;
```

### 5.2 交易策略

#### 策略類型
| 策略 | 說明 |
|------|------|
| Grid Trading | 網格交易，區間內自動低買高賣 |
| DCA | 定投策略，定期定額買入 |
| Trend Following | 趨勢追蹤，順勢操作 |
| Mean Reversion | 均值回歸，超買超賣操作 |
| AI Custom | AI 根據市場狀況自動判斷 |

#### 策略設定範例
```javascript
const strategyConfig = {
  name: "BTC Grid Trading",
  type: "grid",
  symbol: "BTC-USDT",
  params: {
    upperPrice: 70000,
    lowerPrice: 60000,
    gridCount: 10,
    totalInvestment: 1000,  // USDT
    stopLoss: 58000,
    takeProfit: 75000
  },
  riskManagement: {
    maxPositionSize: 0.5,   // 最大倉位 50%
    maxDailyLoss: 50,       // 每日最大虧損 50 USDT
    maxLeverage: 3          // 最大槓桿
  }
};
```

---

## 6. 資料庫設計

### 6.1 資料表結構

```prisma
// prisma/schema.prisma

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  apiKeys   ApiKey[]
  strategies Strategy[]
  trades    Trade[]
  createdAt DateTime @default(now())
}

model ApiKey {
  id         String  @id @default(uuid())
  userId     String
  user       User    @relation(fields: [userId], references: [id])
  exchange   String  // "okx"
  apiKey     String
  secretKey  String  // 加密儲存
  passphrase String  // 加密儲存
  isActive   Boolean @default(true)
}

model Strategy {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  name      String
  type      String   // grid, dca, trend, ai_custom
  symbol    String
  config    Json
  isActive  Boolean  @default(false)
  createdAt DateTime @default(now())
  trades    Trade[]
}

model Trade {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  strategyId  String?
  strategy    Strategy? @relation(fields: [strategyId], references: [id])
  exchange    String
  symbol      String
  side        String   // buy, sell
  type        String   // spot, futures
  orderId     String
  price       Float
  quantity    Float
  fee         Float
  pnl         Float?
  status      String   // pending, filled, cancelled
  executedAt  DateTime
  createdAt   DateTime @default(now())
}

model Portfolio {
  id        String   @id @default(uuid())
  userId    String
  symbol    String
  quantity  Float
  avgPrice  Float
  updatedAt DateTime @updatedAt
}

model MarketData {
  id        String   @id @default(uuid())
  symbol    String
  interval  String   // 1m, 5m, 1h, 1d
  open      Float
  high      Float
  low       Float
  close     Float
  volume    Float
  timestamp DateTime
  
  @@unique([symbol, interval, timestamp])
}
```

---

## 7. API 設計

### 7.1 RESTful API 端點

#### 認證
```
POST   /api/auth/login          登入
POST   /api/auth/register       註冊
POST   /api/auth/logout         登出
GET    /api/auth/me             取得當前用戶
```

#### 帳戶
```
GET    /api/account/balance     取得餘額
GET    /api/account/positions   取得持倉
POST   /api/account/api-key     新增 API Key
DELETE /api/account/api-key/:id 刪除 API Key
```

#### 交易
```
GET    /api/trade/orders        取得訂單列表
POST   /api/trade/order         下單
DELETE /api/trade/order/:id     取消訂單
GET    /api/trade/history       交易歷史
```

#### 策略
```
GET    /api/strategy            取得策略列表
POST   /api/strategy            新增策略
PUT    /api/strategy/:id        更新策略
DELETE /api/strategy/:id        刪除策略
POST   /api/strategy/:id/start  啟動策略
POST   /api/strategy/:id/stop   停止策略
```

#### 市場數據
```
GET    /api/market/ticker/:symbol       取得即時價格
GET    /api/market/candles/:symbol      取得 K 線
GET    /api/market/orderbook/:symbol    取得深度
```

#### AI 分析
```
POST   /api/ai/analyze          AI 市場分析
POST   /api/ai/suggest          AI 交易建議
GET    /api/ai/history          分析歷史
```

### 7.2 WebSocket 事件

```javascript
// 客戶端訂閱
socket.emit('subscribe', { 
  channels: ['ticker:BTC-USDT', 'position', 'order'] 
});

// 服務端推送
socket.on('ticker', { symbol, price, change24h, volume });
socket.on('position', { positions: [...] });
socket.on('order', { orderId, status, filledQty });
socket.on('trade', { tradeId, symbol, side, price, qty });
socket.on('alert', { type, message });
```

---

## 8. 前端頁面設計

### 8.1 頁面結構

```
/                       首頁（重定向到 Dashboard）
/login                  登入頁
/register               註冊頁
/dashboard              儀表板
  ├── 帳戶總覽
  ├── 即時 PnL
  ├── 持倉列表
  └── 最近交易
/trade                  交易頁
  ├── K 線圖表
  ├── 下單面板
  ├── 訂單簿
  └── 成交明細
/portfolio              投資組合
  ├── 資產分配圖
  ├── 持倉詳情
  └── 歷史績效
/strategy               策略管理
  ├── 策略列表
  ├── 新增策略
  └── 策略回測
/ai-analysis            AI 分析
  ├── 市場分析
  ├── 交易建議
  └── 分析歷史
/settings               設定
  ├── API Key 管理
  ├── 通知設定
  └── 風險設定
```

### 8.2 UI 元件

```
components/
├── layout/
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   └── Footer.tsx
├── charts/
│   ├── CandlestickChart.tsx
│   ├── PortfolioChart.tsx
│   └── PnLChart.tsx
├── trading/
│   ├── OrderForm.tsx
│   ├── OrderBook.tsx
│   ├── PositionList.tsx
│   └── TradeHistory.tsx
├── strategy/
│   ├── StrategyCard.tsx
│   ├── StrategyForm.tsx
│   └── BacktestResult.tsx
└── common/
    ├── Button.tsx
    ├── Input.tsx
    ├── Modal.tsx
    └── Table.tsx
```

---

## 9. 安全性設計

### 9.1 API Key 保護
- API Key 使用 AES-256 加密後儲存
- 密鑰存放於環境變數
- 前端永不顯示完整 API Key

### 9.2 交易安全
- 所有交易操作需要二次確認
- 設定每日最大交易金額
- 異常交易自動暫停並通知

### 9.3 系統安全
- JWT Token 認證
- Rate Limiting 防止濫用
- 所有敏感操作記錄日誌

---

## 10. 部署架構

### 10.1 開發環境
```bash
# 本地開發
npm run dev        # 啟動開發服務器
npm run db:push    # 同步資料庫
npm run db:studio  # 開啟 Prisma Studio
```

### 10.2 生產環境
```
推薦部署方案：
- Frontend: Vercel
- Backend: Railway / Render / VPS
- Database: SQLite (小規模) / PostgreSQL (大規模)
```

---

## 11. 開發時程規劃

### Phase 1: 基礎建設 (Week 1-2)
- [ ] 專案初始化 (Next.js + Express)
- [ ] 資料庫設計與建立
- [ ] 用戶認證系統
- [ ] OKX API 整合（市場數據）

### Phase 2: 核心交易 (Week 3-4)
- [ ] OKX API 整合（交易功能）
- [ ] 現貨交易功能
- [ ] 合約交易功能
- [ ] 訂單管理

### Phase 3: AI 分析 (Week 5-6)
- [ ] 技術指標計算
- [ ] GPT 市場分析整合
- [ ] AI 交易建議
- [ ] 分析報告生成

### Phase 4: 自動化策略 (Week 7-8)
- [ ] 策略引擎架構
- [ ] 網格交易策略
- [ ] DCA 策略
- [ ] 策略回測功能

### Phase 5: 前端介面 (Week 9-10)
- [ ] Dashboard 頁面
- [ ] 交易頁面（含 K 線圖）
- [ ] 投資組合頁面
- [ ] 策略管理頁面

### Phase 6: 優化上線 (Week 11-12)
- [ ] 效能優化
- [ ] 安全性強化
- [ ] 測試與除錯
- [ ] 部署上線

---

## 12. 風險提示

⚠️ **重要聲明**

1. **投資風險**：加密貨幣交易具有高風險，可能導致本金損失
2. **槓桿風險**：合約交易使用槓桿會放大盈虧
3. **技術風險**：自動交易可能因系統故障、網路中斷而造成損失
4. **API 風險**：API Key 外洩可能導致資產損失

建議：
- 先使用小額資金測試
- 設定嚴格的止損
- 定期備份和檢查系統
- 切勿投入無法承受損失的資金

---

## 13. 下一步行動

準備開始開發後，請提供：

1. **OKX API 資訊**
   - API Key
   - Secret Key
   - Passphrase
   - 是否使用模擬盤 (Demo Trading)

2. **偏好設定**
   - 主要交易幣種
   - 預期投資金額
   - 風險承受度

3. **開發優先順序**
   - 想先完成哪個功能模組？

---

*文件版本: 1.0*
*最後更新: 2026-06-07*
