# 빠른 시작

REST API, MCP 도구, 인증 및 상태 기반 워크플로우를 갖춘 완전히 기능하는 AXL 서버를 **5분 이내에** 구축하세요.

---

### 1단계: CLI 설치
`ash
npm install -g scl-axl
`

### 2단계: 프로젝트 초기화
`ash
mkdir my-first-axl && cd my-first-axl
axl init -y
`

### 3단계: Flow 파일 컴파일
`ash
axl compile
`

### 4단계: 엔진 시작
`ash
axl serve
`

---

## 테스트해보기

### REST 호출
`ash
curl -s -X POST http://localhost:3939/actions/list_projects -H "Content-Type: application/json" -d "{}"
`

### AI 에이전트 연결 (MCP)
mcp.json에 추가:
`json
{ "mcpServers": { "my-axl-server": { "command": "npx", "args": ["axl", "serve", "--dir", "/path/to/flow"] } } }
`

### 다음 단계
- [호텔 예약 예시](../../../examples/hotel-booking)
- [아키텍처](../../architecture.md)
- [.flow 언어](../../language.md)
- [권한 및 속도 제한](../../permissions.md)
