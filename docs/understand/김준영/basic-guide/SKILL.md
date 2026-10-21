---
name: basic-guide
description: 이 프로젝트(배터리 주문·운항 계획 앱)를 개발 지식이 없는 사람이 단계별로 이해하도록 돕는 3탭 HTML 가이드를 education/basic-guide.html 로 만든다. "기본 가이드", "프로젝트 이해용 HTML", "교육 자료 만들어/갱신해" 같은 요청에 쓴다.
---

# basic-guide

개발 지식이 없는 사람이 3개 탭으로 단계별로 이해하는 로컬 HTML 1개를 만든다.

- 출력: `education/basic-guide.html` (폴더가 없으면 만든다. 이미 있으면 덮어쓰기 전에 사용자에게 알린다)
- 서버·외부 라이브러리 없이 HTML/CSS/JS만 쓰는 단일 파일. 더블클릭으로 열려야 한다.
- 언어는 한국어. 코드·파일명·클래스명·기술 용어는 화면에 쓰지 않는다.

## 순서

1. **코드 읽기**: `src/main/java/com/example/demo`(특히 `simulation/Planner.java`, `service/BatteryService.java`, `controller/AppController.java`)와 `CLAUDE.md`를 읽어 현재 규칙·기본값을 확인한다. 기억이 아니라 현재 코드 기준으로 쓴다.
2. **쉬운 말 정리**: `references/plain-language.md`의 치환 규칙으로 용어를 바꾼다.
3. **내용 채우기**: `references/tab-guide.md`의 3탭 기준에 맞춰 `assets/template.html`의 `{{...}}` 자리를 채운다.
4. **계산기 검증**: 탭 3의 간이 계산기 숫자를 실제 값과 대조한다. 기본값은 `BatteryService.initDefaults()`, 기준 예시는 `PlannerTest`에서 가져온다. 맞지 않으면 계산기를 고친다.
5. **점검**: 생성된 HTML을 `plain-language.md`의 금지 용어로 검색해 남은 것이 없는지 확인한다. 탭 전환·버튼·슬라이더·퀴즈가 동작하는지 확인한다(가능하면 브라우저로 열어 본다).
6. 만든 파일 경로와 "간이 계산기는 실제 결과의 단순화 버전"이라는 점을 한 줄로 알린다.

## 원칙

- 탭 하나는 1~2분 안에 볼 분량. 한 화면에 내용을 많이 넣지 않는다.
- 이 스킬은 HTML만 만든다. 앱 코드는 수정하지 않는다.
