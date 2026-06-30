# 우리의 하루 — 테사호드관 & 지인 데일리 트래커

Next.js + Supabase. 둘만의 공유 코드로 같은 기록을 실시간으로 함께 봐요.
수면(메인) · 운동 · 간식(내용까지) · 3감사 · 한 줄 후기 + 응원볼.

---

## 1) Supabase 테이블 만들기 (1분)

1. Supabase 대시보드 > 왼쪽 **SQL Editor** 열기
2. `supabase-setup.sql` 내용 전체 복사 → 붙여넣기 → **RUN**
3. 끝. (`entries` 테이블 + 실시간 동기화까지 켜짐)

> 이미 연결값(.env.local)은 네 프로젝트로 채워뒀어.

## 2) 로컬에서 실행 (선택)

```bash
npm install
npm run dev
```
→ http://localhost:3000

## 3) Vercel 배포

1. 이 폴더를 GitHub 저장소에 올림 (`git init` → push)
2. vercel.com → **Add New > Project** → 저장소 선택
3. **Environment Variables** 에 아래 2개 추가:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://cfztxjblbwrxtsvlpnyp.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_KEY` = `sb_publishable_tGZr2Zsa-iLW-Hr2sNUNkg_QYbGPt8G`
4. **Deploy**

배포되면 나온 주소를 둘 다 폰에서 열고 → 같은 **공유 코드** 입력 →
한 명은 "테사호드관", 다른 한 명은 "지인" 선택. 끝.

> 폰: Safari/Chrome에서 "홈 화면에 추가" 하면 앱처럼 써요.

---

## 작동 방식
- 데이터는 `(공유코드, 날짜, 사람)` 단위로 저장돼서 서로 안 덮어씀.
- 상대가 입력하면 실시간으로 내 화면에도 반영됨.
- 스트릭/주간 수면 평균은 누적 데이터로 자동 계산.

## ⚠️ 보안 메모 (둘이 쓰기엔 충분)
공유 코드 방식이라 회원가입이 없어. 대신 **공개 키로 누구나 테이블 접근이 가능**해서,
이론상 공유 코드를 아는 사람만 데이터를 보지만 코드가 길수록 안전해
(예: `jiin-tessa-93f2k`). 더 단단히 잠그고 싶으면 Supabase Auth나
코드별 RPC 방식으로 업그레이드 가능 — 필요하면 말해줘.
