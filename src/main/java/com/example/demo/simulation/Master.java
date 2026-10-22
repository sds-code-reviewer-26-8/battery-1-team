package com.example.demo.simulation;

import com.example.demo.entity.Country;
import java.util.List;

/** 시뮬레이션에 쓰는 마스터 데이터 스냅샷. 주문 확정 시 그대로 저장된다. */
public record Master(long version, int shipCount, long shipDailyCostWon, List<FactoryParam> factories,
		List<RouteParam> routes) {

	/** 하루 운영비 기본값: 10억 원 */
	public static final long DEFAULT_OPERATING_DAILY_COST_WON = 1_000_000_000L;

	/** operatingDailyCostWon: 공장 하루 운영비(원). 이 값이 없던 때 저장된 계획의 스냅샷에서는 0 으로 읽힌다. */
	public record FactoryParam(Country country, int maxDaily, int stockLimit, long unitCost,
			long operatingDailyCostWon) {

		public FactoryParam(Country country, int maxDaily, int stockLimit, long unitCost) {
			this(country, maxDaily, stockLimit, unitCost, DEFAULT_OPERATING_DAILY_COST_WON);
		}
	}

	public record RouteParam(Country from, Country to, int days) {
	}

	public FactoryParam factory(Country country) {
		return factories.stream().filter(f -> f.country() == country).findFirst()
				.orElseThrow(() -> new IllegalStateException("공장 정보가 없습니다: " + country));
	}

	public int days(Country a, Country b) {
		if (a == b) {
			return 0;
		}
		return routes.stream()
				.filter(r -> (r.from() == a && r.to() == b) || (r.from() == b && r.to() == a))
				.findFirst()
				.orElseThrow(() -> new IllegalStateException("항로 정보가 없습니다: " + a + "-" + b))
				.days();
	}
}
