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
3. **Environment Variables** 에 아래 2개 추가 (값은 Supabase > Project Settings > API 의 URL·publishable 키):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_KEY`
   - (선택) `NEXT_PUBLIC_SITE_URL` = 배포 주소 (OG 미리보기 절대 주소용)
4. **Deploy**

배포되면 나온 주소를 둘 다 폰에서 열고 → 같은 **공유 코드** 입력 →
한 명은 "테사호드관", 다른 한 명은 "지인" 선택. 끝.

> 폰: Safari/Chrome에서 "홈 화면에 추가" 하면 앱처럼 써요.

---

## 작동 방식
- 데이터는 `(공유코드, 날짜, 사람)` 단위로 저장돼서 서로 안 덮어씀.
- 상대가 입력하면 실시간으로 내 화면에도 반영됨.
- 스트릭/주간 수면 평균은 누적 데이터로 자동 계산.

## ⚠️ 보안 메모
- 브라우저에 들어가는 `sb_publishable_...` 키는 공개용 키라 노출돼도 괜찮지만, **권한은 DB 함수가 지켜야** 해요.
- 기록은 로그인 + 커플 연결을 확인하는 `gs2_*` 함수로만 읽고 써요. 공유 코드만으로 접근하던 예전 경로를
  막는 SQL 은 `supabase/migrations/20261027_security_hardening.sql` 에 있어요 (적용 방법은 `작업보고.md`).
- 이 저장소는 공개 저장소라 백업 원문을 커밋하면 안 돼요. 주간 백업은 `BACKUP_PASSPHRASE` 로 암호화해서 올려요.
