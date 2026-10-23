#!/bin/sh
# 사용: src/test/jmeter/script/run.sh <차수> <perf-baseline|stress-step|stress-concurrency> <라벨> [-Jkey=value ...]
# 예) run.sh 01 stress-step s2-read100 -JreadThreads=100 -Jrampup=10 -Jduration=120
# 서버를 19080 포트 인메모리 DB 로 새로 띄우고(실제 ./data 와 무관), JMeter 를 CLI 로 실행한다.
# 원본(.jtl·JFR·로그)은 build/jmeter/<차수>/<라벨>/ 에만 남기고(git 제외),
# 결과 HTML 은 docs/jmeter/round-<차수>/ 에 만든다(<라벨>.html + 차수 전체 index.html).
# JMETER_HOME 기본값: ~/tools/apache-jmeter-5.6.3
set -e
cd "$(dirname "$0")/../../../.."
ROUND=${1:?차수 필요 (예: 01)}; PLAN=${2:?plan 이름 필요}; LABEL=${3:?라벨 필요}; shift 3
JMETER_HOME=${JMETER_HOME:-$HOME/tools/apache-jmeter-5.6.3}
PORT=19080
RAW=build/jmeter/round-$ROUND/$LABEL
DOCS=docs/jmeter/round-$ROUND
mkdir -p "$RAW" "$DOCS"

[ -f build/libs/demo-0.0.1-SNAPSHOT.jar ] || sh ./gradlew bootJar -q
java -XX:StartFlightRecording=filename="$RAW/server.jfr",settings=profile \
	-jar build/libs/demo-0.0.1-SNAPSHOT.jar --server.port=$PORT \
	--spring.datasource.url="jdbc:h2:mem:perf;DB_CLOSE_DELAY=-1" --spring.jpa.hibernate.ddl-auto=create-drop \
	> "$RAW/server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; wait $SERVER 2>/dev/null || true' EXIT
for i in $(seq 1 60); do
	curl -s -o /dev/null "http://localhost:$PORT/login" && break
	sleep 1
done

"$JMETER_HOME/bin/jmeter" -n -t "src/test/jmeter/$PLAN.jmx" -l "$RAW/result.jtl" -j "$RAW/jmeter.log" \
	-Jport=$PORT -Jcsv="$PWD/src/test/jmeter/orders.csv" -Jjmeter.save.saveservice.output_format=csv \
	-Jjmeter.save.saveservice.response_message=true "$@" || true
kill $SERVER; wait $SERVER 2>/dev/null || true; trap - EXIT

python3 src/test/jmeter/script/report.py run "$RAW/result.jtl" "$DOCS/$LABEL.html" --plan "$PLAN" --label "$LABEL" --round "$ROUND" --args "$*"
python3 src/test/jmeter/script/report.py index "$DOCS" "$DOCS/index.html"
echo "결과: $DOCS/index.html"
