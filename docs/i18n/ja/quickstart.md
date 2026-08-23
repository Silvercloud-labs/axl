# クイックスタート

REST API、MCP ツール、認証、ステートフルなワークフローを持つ完全に機能する AXL サーバーを **5 分以内** に構築します。

---

### ステップ 1: CLI のインストール
`ash
npm install -g scl-axl
`

### ステップ 2: プロジェクトの初期化
`ash
mkdir my-first-axl && cd my-first-axl
axl init -y
`

### ステップ 3: Flow ファイルのコンパイル
`ash
axl compile
`

### ステップ 4: エンジンの起動
`ash
axl serve
`

---

## 試してみる

### REST 呼び出し
`ash
curl -s -X POST http://localhost:3939/actions/list_projects -H "Content-Type: application/json" -d "{}"
`

### AI エージェントの接続 (MCP)
mcp.json に追加:
`json
{ "mcpServers": { "my-axl-server": { "command": "npx", "args": ["axl", "serve", "--dir", "/path/to/flow"] } } }
`

### 次のステップ
- [ホテル予約の例](../../../examples/hotel-booking)
- [アーキテクチャ](../../architecture.md)
- [.flow 言語](../../language.md)
- [権限とレート制限](../../permissions.md)
