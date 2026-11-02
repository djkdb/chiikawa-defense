# pixelfx (가져온 코드)

이 폴더는 [patch-gg/pixelfx](https://github.com/patch-gg/pixelfx) (커밋 a84159688af3ca37a4be05a0d422b94451b2e24e, 2026-10-31)에서
`src/core/` 전부와 이 게임이 쓰는 효과 9개(+ 그 범주의 `_lib.js`)만 그대로 옮겨 온 것입니다. 손으로 고치지 않습니다 — 게임과 잇는 코드는 `js/pfxlayer.js`.

- pixelfx: MIT License, Copyright (c) 2026 Patch, Copyright (c) 2026 Hugo Duprez — `LICENSE`
- `core/sim.js` 와 파일 맨 위에 그렇게 적힌 효과는 Sprite Fusion 의 오픈소스 픽셀 VFX(https://www.spritefusion.com/pixel-art-vfx)를 고친 것: Copyright (c) 2026 Hugo Duprez, MIT License
- `core/act.js` 는 Hollow Crown(https://github.com/rehan-remade/hollow-crown)의 스킬 연출 방식을 고친 것: Copyright (c) 2026 rehan-remade, MIT License
- pixelfx 저장소의 Patch Pixel 글꼴(gallery/fonts)은 MIT 가 아니므로 가져오지 않았습니다.

쓰는 효과: impacts/crit-hit · spawn/poof · arcane/mana-burst · explosions/firework-burst · ice/snowflake-burst · holy/heal-aoe · shadow/hex-sigil · spawn/spawn-portal · ui/confetti
