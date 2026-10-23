# 성능·스트레스 테스트 (JMeter)

서버가 사용자가 몰릴 때 얼마나 버티는지 재는 테스트입니다. 결과는 `round-<차수>/index.html`을 브라우저로 열어 보면 됩니다.

## 무엇을 재나

| 구분 | 질문 | plan |
| --- | --- | --- |
| 성능 | 평소 수준의 부하에서 응답이 얼마나 빠른가 (기준선) | `perf-baseline.jmx` |
| 스트레스 | 사용자를 단계별로 늘리면 어디서 느려지거나 오류가 나는가 | `stress-step.jmx` |
| 동시성 경합 | 같은 주문을 동시에 바꾸려 할 때 한 명만 성공하고 나머지는 거절(409)되는가 | `stress-concurrency.jmx` |

용어: **Thread**는 가상 사용자 1명, **Ramp-up**은 사용자를 몇 초에 걸쳐 투입할지, **Throughput**은 서버가 1초에 처리하는 요청 수(req/s), **p95**는 요청의 95%가 이 시간 안에 끝난다는 뜻(ms)입니다.

## 결과 보는 법

- `round-01/index.html`: 한 차수의 전체 요약. 실행 목록, 판정, 사용자 수별 p95·Throughput 추이.
- `round-01/<라벨>.html`: 실행 하나의 상세. 요청별 응답시간 표, 시간대별 처리량, 요청별 응답시간 산점도.
- 판정 기준(모두 **제안값, 근거 없음, 확인 필요**): 오류율 0%, 읽기 p95 500ms 이하, 확정 p95 1,000ms 이하. 스트레스는 오류율 1% 초과를 한계로 보고, 단계별 p95는 기록만 합니다. 경합은 "성공 1건, 나머지 409, 5xx 없음"이며 이 값은 `OrderService` 규칙에서 나왔습니다.
- 오류 없이 응답시간만 튀는 구간이 있으면 서버 내부를 봐야 합니다. 실행마다 JFR(`build/jmeter/.../server.jfr`)이 남으니 JDK Mission Control로 열어 느린 메서드·GC·락 대기를 확인합니다.

## 테스트 대상 (admin 로그인 후 세션 사용)

| 요청 | 종류 |
| --- | --- |
| `POST /api/simulate` | 읽기(계산) |
| `GET /api/orders` | 읽기(전체 목록) |
| `GET /api/orders/{id}` | 읽기 |
| `POST /api/orders` | 쓰기(확정) |
| `POST /api/orders/{id}/status` | 쓰기(경합 시나리오만) |

마스터 수정(`POST /master`)은 마스터 version을 올려 확정을 대량으로 409로 만들기 때문에 부하 대상에서 뺐습니다.

## 실행하는 법

준비: JMeter 5.x(기본 `~/tools/apache-jmeter-5.6.3`, 다르면 `JMETER_HOME`), Java 17. 처음이면 `sh ./gradlew bootJar`는 스크립트가 알아서 합니다.

```
src/test/jmeter/script/run.sh <차수> <plan 이름> <라벨> [-Jkey=value ...]

# 기준선
src/test/jmeter/script/run.sh 02 perf-baseline baseline
# 스트레스 한 단계 (읽기 100명)
src/test/jmeter/script/run.sh 02 stress-step s2-read100 -JreadThreads=100 -Jrampup=10 -Jduration=120
# 경합
src/test/jmeter/script/run.sh 02 stress-concurrency race
```

- 스크립트가 서버를 **19080 포트, 인메모리 DB**로 새로 띄웁니다. 실제 DB(`./data/battery`)나 8080 서버와 무관하고, 실행이 끝나면 서버를 끕니다.
- 주요 옵션: `-JreadThreads`, `-JwriteThreads`, `-Jrampup`, `-Jduration`(초), `-Jseed`(미리 쌓을 주문 수, 기본 50).
- `.jtl`, JFR, 로그는 `build/jmeter/round-<차수>/<라벨>/`에만 남고 git에서 제외됩니다. git에는 `docs/jmeter/round-<차수>/`의 HTML만 올립니다.
- plan을 고치거나 확인할 때만 JMeter GUI로 `.jmx`를 열고, 측정은 항상 위 CLI 스크립트로 합니다.

## 결과를 읽을 때 주의

- 서버와 JMeter가 **같은 PC**에서 돌아 CPU를 나눠 씁니다. 절대 성능이 아니라 기준선과 단계 간 상대 비교로만 읽으세요.
- 인메모리 DB라 파일 DB와 성능이 다를 수 있습니다.
- 기동 직후 약 30초는 워밍업이라 느리게 나올 수 있습니다(산점도에 옅게 표시).
- 아직 하지 않은 것: 쓰기(확정) 단독 스트레스, 장시간 반복(soak), 장애 주입·복구 테스트.
