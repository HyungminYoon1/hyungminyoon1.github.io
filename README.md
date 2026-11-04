# 백엔드 및 AI 응용 개발 포트폴리오

[포트폴리오 보기](https://hyungminyoon1.github.io/)

Nodease, StoreOps와 험비 교범 RAG 연구의 문제, 구현 방법과 시험 결과를 정리한 정적 사이트입니다. AI Helpdesk는 학습 기록으로 연결합니다. 상세 페이지에는 담당 범위, 측정 조건과 AI 활용 범위를 함께 적었습니다.

## 로컬 실행

Node.js 20 이상이면 별도 라이브러리 설치 없이 실행할 수 있습니다. 저장소 디렉터리에서 다음 명령을 실행합니다.

```sh
npm run build
npm run check
npm run audit
npm run preview
```

Windows PowerShell에서는 `npm` 대신 `npm.cmd`를 사용할 수 있습니다. 로컬 주소는 `http://127.0.0.1:4177/`이며 서버 종료는 `Ctrl+C`입니다. 파일 수정 후 다시 빌드하고 브라우저를 새로고침합니다.

## 구성과 공개 범위

- `index.html`: 프로젝트 요약과 문제별 사례, 학습 기록
- `projects/`: 세 프로젝트의 상세 설명
- `assets/`: 자체 CSS, 모바일 메뉴 JavaScript와 SVG 아이콘
- `evidence/storeops-summary.json`: 기존 검증 보고서의 조건과 결과 요약
- `scripts/public-files.mjs`: 사이트에 배포하는 파일 목록
- `scripts/publication-files.mjs`: 공개 저장소에 포함하는 파일 목록
- `.github/workflows/pages.yml`: 검사와 GitHub Pages 배포

작업 메모, 변경 전 사본과 화면 검수 자료는 `docs/`, `.local/`, `output/` 등에 로컬로 보관하며 Git과 배포 대상에서 제외합니다. 원본 이력서, 사진, 연락처, 학력 자료, 교범 원본, 전체 로그나 계정 정보는 포함하지 않습니다. GitHub 계정과 공개 프로젝트 링크를 연결하므로 익명 사이트는 아닙니다.

## 검사와 배포

`main`에 푸시하면 GitHub Actions가 빌드, 문서 구조/링크 검사와 공개 정보 점검을 실행합니다. 검사를 통과한 `dist/`만 Pages에 올립니다. 저장소 루트 전체를 웹사이트로 제공하지 않습니다.

개인정보와 비밀값 점검은 공개 소스, 배포 파일과 Git 기록을 대상으로 합니다. 새 파일은 두 공개 목록을 검토한 뒤 추가합니다. 패턴 검사는 사람의 검토를 보완하는 수단입니다.

사이트는 외부 스크립트, 분석 도구, 웹 폰트와 로그인 기능을 사용하지 않습니다. HTML의 콘텐츠 보안 정책과 참조 주소 전송 제한을 적용했습니다. GitHub Pages의 응답 헤더 전체를 이 저장소에서 제어하는 것은 아닙니다.

공개 페이지는 검색 엔진에 노출될 수 있습니다. 수정 시에도 실험 조건과 현재 운영 상태를 유지하고, 로컬 시험 결과를 실제 사용자 서비스의 운영 지표로 바꾸지 않습니다.
