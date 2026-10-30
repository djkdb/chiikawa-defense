# CLAUDE.md — 치이카와 「랜덤 디펜스」

치이카와 세계관 비영리 팬 웹게임. 무작위 소환 → 같은 친구·같은 등급 합성 → 웨이브·보스, 난이도 4단(쉬움~지옥)+무한, 괴물 특성 5종, 보스 기술 4종, 확률 업, 행운 소환, 신화 레시피, 3택 보상·이자.
빌드 없는 정적 HTML+JS (Canvas 2D). 2026-10-30 `djkdb/insta_auto` 의 `portfolio_src/chiikawa-defense` 에서 기록째 옮겨 옴.

- 배포: Vercel 프로젝트 `chiikawa-defense` (팀 zun-it) → https://chiikawa-defense-zun-it.vercel.app . 푸시로 자동 배포되지 않으면 Vercel 에서 다시 배포.
- 숫자(밸런스)는 `js/table.js` 한 곳. 밸런스는 `node tools/sim.js 40 --md` (난이도별 봇 판) 로 확인하고 README 표 갱신.
- 웹앱: `manifest.webmanifest` · `sw.js`(HTML/JS network-first, 그림 SWR — 캐시 버전을 올려야 새 그림이 감) · 인앱 브라우저 안내 `js/inapp.js`+`inapp.css` (게임 무관 모듈 — 자격증 수첩·토익 타자에 복사해 붙일 것, README 「다른 게임에 붙이기」). `?nosw` 로 서비스워커 끔.
- 그림: 친구 8명은 사람이 준 초록 시트(`_chiikawa_tools/sheets/green_*`)를 `_chiikawa_tools/slice_green.py` 로 자른 56칸 도트 → `tools/chars_manifest.py` · 괴물/보스 `tools/monsters_slice.py` · 타일 `tools/tiles_slice.py` · UI 키트 `tools/ui_install.py`. **캐릭터를 직접 그리지 말 것**.
- 사람이 정한 것: 크림색 금지 · 효과음에 「쉭」 바람 소리 금지 · 합성 카드는 판을 가리지 않게(큰 카드는 전설 이상, 칸 위 작게) · 폰은 판 크게·버튼 얇게(최소 36px) · 인스타 DM(인앱, 세로 약 650px)에서 한 화면 · 팬 게임 고지 유지.
- 사람 결정 대기: 신화 레시피의 「빠진 재료 = 남는 전설 + 클로버 1개」 대체를 유지할지.
- 확인: `python3 tools/play_check_v2.py` (6 크기 배치 + 실제 판) · `python3 tools/pwa_check.py` (인앱 환경별 안내·오프라인). 결과물은 `output/` (커밋 안 함). 렌더링을 바꿨으면 판 PNG 를 눈으로 본 뒤 커밋.
- 커밋: 한국어로 무엇을 왜, 한 커밋에 한 가지.
