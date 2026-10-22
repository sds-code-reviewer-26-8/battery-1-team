package com.example.demo.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.demo.entity.Country;
import com.example.demo.simulation.Master.FactoryParam;
import com.example.demo.simulation.Master.RouteParam;
import com.example.demo.simulation.Plan.Stop;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PlannerTest {

	private static Master master(int ships) {
		return new Master(1, ships, 100_000_000L,
				List.of(new FactoryParam(Country.CHINA, 400, 4000, 700),
						new FactoryParam(Country.JAPAN, 800, 2000, 900),
						new FactoryParam(Country.VIETNAM, 200, 10000, 550),
						new FactoryParam(Country.INDONESIA, 300, 7000, 450)),
				List.of(new RouteParam(Country.KOREA, Country.CHINA, 1),
						new RouteParam(Country.KOREA, Country.JAPAN, 2),
						new RouteParam(Country.KOREA, Country.VIETNAM, 5),
						new RouteParam(Country.KOREA, Country.INDONESIA, 7),
						new RouteParam(Country.CHINA, Country.JAPAN, 2),
						new RouteParam(Country.CHINA, Country.VIETNAM, 4),
						new RouteParam(Country.CHINA, Country.INDONESIA, 6),
						new RouteParam(Country.JAPAN, Country.VIETNAM, 5),
						new RouteParam(Country.JAPAN, Country.INDONESIA, 7),
						new RouteParam(Country.VIETNAM, Country.INDONESIA, 2)));
	}

	private static Map<Country, Integer> orders(int china, int japan, int vietnam, int indonesia) {
		Map<Country, Integer> m = new EnumMap<>(Country.class);
		m.put(Country.CHINA, china);
		m.put(Country.JAPAN, japan);
		m.put(Country.VIETNAM, vietnam);
		m.put(Country.INDONESIA, indonesia);
		return m;
	}

	@Test
	void visitsAreCeilOfOrderOverStockLimit() {
		Map<Country, Integer> v = Planner.visits(master(3), orders(4001, 2000, 0, 14000));
		assertThat(v.get(Country.CHINA)).isEqualTo(2);
		assertThat(v.get(Country.JAPAN)).isEqualTo(1);
		assertThat(v.get(Country.VIETNAM)).isEqualTo(0);
		assertThat(v.get(Country.INDONESIA)).isEqualTo(2);
	}

	@Test
	void everyOptionCollectsExactlyWhatWasOrdered() {
		Map<Country, Integer> orders = orders(3000, 3000, 3000, 3000);
		for (Plan plan : Planner.plan(master(3), orders)) {
			Map<Country, Integer> loaded = new EnumMap<>(Country.class);
			plan.ships().forEach(s -> s.trips().forEach(t -> t.stops()
					.forEach(st -> loaded.merge(st.country(), st.loadK(), Integer::sum))));
			assertThat(loaded).as(plan.label()).isEqualTo(orders);
			assertThat(plan.totalCost()).isEqualTo(plan.productionCost() + plan.shippingCost() + plan.operatingCost());
		}
	}

	@Test
	void eachCountryIsVisitedByOneShipOnly() {
		for (Plan plan : Planner.plan(master(4), orders(5000, 5000, 5000, 5000))) {
			Map<Country, Integer> owner = new EnumMap<>(Country.class);
			plan.ships().forEach(s -> s.trips().forEach(t -> t.stops().forEach(st -> {
				Integer prev = owner.put(st.country(), s.no());
				assertThat(prev == null || prev == s.no()).as(plan.label() + " " + st.country()).isTrue();
			})));
		}
	}

	@Test
	void productionCostIsCellsTimesUnitCost() {
		Plan plan = Planner.plan(master(3), orders(1000, 0, 0, 0)).get(0);
		assertThat(plan.productionCost()).isEqualTo(1000L * 1000 * 700);
	}

	@Test
	void singleSmallOrderTakesProductionPlusRoundTrip() {
		// 중국 400K = 하루 최대 400K → 1일 생산, 한국-중국 1일 → 왕복 2일
		Plan plan = Planner.plan(master(1), orders(400, 0, 0, 0)).get(0);
		assertThat(plan.ships()).hasSize(1);
		Stop stop = plan.ships().get(0).trips().get(0).stops().get(0);
		assertThat(stop.arriveDay()).isEqualTo(1);
		assertThat(plan.totalDays()).isEqualTo(2);
		assertThat(plan.shippingCost()).isEqualTo(2 * 100_000_000L);
	}

	@Test
	void shipDepartsLateSoItDoesNotWaitAtPort() {
		// 베트남 2000K / 200K일 = 10일 생산. 한국-베트남 5일 → 5일차 출항, 10일차 도착, 15일차 귀환
		Plan plan = Planner.plan(master(1), orders(0, 0, 2000, 0)).get(0);
		var trip = plan.ships().get(0).trips().get(0);
		assertThat(trip.departDay()).isEqualTo(5);
		assertThat(trip.stops().get(0).arriveDay()).isEqualTo(10);
		assertThat(plan.totalDays()).isEqualTo(15);
		assertThat(plan.shippingCost()).isEqualTo(10 * 100_000_000L);
	}

	@Test
	void overStockLimitOrderIsCollectedInSeveralRoundTrips() {
		// 일본 4500K, 재고 상한 2000K → 3번 방문(2000, 2000, 500)
		Plan plan = Planner.plan(master(1), orders(0, 4500, 0, 0)).get(0);
		List<Integer> loads = plan.ships().get(0).trips().stream().map(t -> t.stops().get(0).loadK()).toList();
		assertThat(loads).containsExactly(2000, 2000, 500);
		assertThat(plan.stock().get(Country.JAPAN)[plan.totalDays()]).isZero();
	}

	@Test
	void productionStopsAtStockLimitUntilPickup() {
		Plan plan = Planner.plan(master(1), orders(0, 4500, 0, 0)).get(0);
		int limit = 2000;
		for (int s : plan.stock().get(Country.JAPAN)) {
			assertThat(s).isLessThanOrEqualTo(limit);
		}
	}

	@Test
	void costOptionIsNotMoreExpensiveAndFastOptionIsNotSlower() {
		List<Plan> plans = Planner.plan(master(3), orders(3000, 3000, 3000, 3000));
		Plan cost = plans.get(0);
		Plan fast = plans.get(1);
		Plan near = plans.get(2);
		assertThat(cost.shippingCost() + cost.operatingCost()).isLessThanOrEqualTo(fast.shippingCost() + fast.operatingCost())
				.isLessThanOrEqualTo(near.shippingCost() + near.operatingCost());
		assertThat(fast.totalDays()).isLessThanOrEqualTo(cost.totalDays()).isLessThanOrEqualTo(near.totalDays());
	}

	@Test
	void usesAtMostAvailableShips() {
		for (Plan plan : Planner.plan(master(2), orders(3000, 3000, 3000, 3000))) {
			assertThat(plan.ships().size()).isLessThanOrEqualTo(2);
		}
	}

	@Test
	void rejectsEmptyOrder() {
		assertThatThrownBy(() -> Planner.plan(master(3), orders(0, 0, 0, 0)))
				.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void defaultOrderSummary() {
		for (Plan plan : Planner.plan(master(3), orders(3000, 3000, 3000, 3000))) {
			System.out.printf("%s: %d일, 생산 %.2f억, 운항 %.2f억, 합계 %.2f억, 배 %d척%n", plan.label(), plan.totalDays(),
					plan.productionCost() / 1e8, plan.shippingCost() / 1e8, plan.totalCost() / 1e8,
					plan.ships().size());
			plan.ships().forEach(s -> s.trips().forEach(t -> System.out.println("  " + s.no() + "호 출항 "
					+ t.departDay() + " → " + t.stops().stream()
							.map(st -> st.country().getLabel() + "(" + st.arriveDay() + "일," + st.loadK() + ")").toList()
					+ " → 귀환 " + t.returnDay())));
		}
	}

	// ---------------------------------------------------------------- 공장 운영비

	private static final long OPERATING_DAILY = Master.DEFAULT_OPERATING_DAILY_COST_WON;

	private static int lastProductionDay(Plan plan, Country c) {
		int[] pr = plan.production().get(c);
		for (int t = pr.length - 1; t >= 0; t--) {
			if (pr[t] > 0) {
				return t;
			}
		}
		return -1;
	}

	@Test
	void firstOptionIsLabeledTotalCostMinimum() {
		List<Plan> plans = Planner.plan(master(3), orders(3000, 3000, 3000, 3000));
		assertThat(plans.get(0).type()).isEqualTo(Planner.COST);
		assertThat(plans.get(0).label()).isEqualTo("총비용 최소");
		assertThat(plans.get(1).label()).isEqualTo("가장 빠르게");
		assertThat(plans.get(2).label()).isEqualTo("가까운 곳부터");
	}

	@Test
	void factoryWithoutOrderHasZeroOperatingDaysAndCost() {
		// 중국 400K = 1일 생산. 배를 기다리는 날은 운영일수에 넣지 않는다 (총 2일 중 운영 1일)
		Plan plan = Planner.plan(master(1), orders(400, 0, 0, 0)).get(0);
		assertThat(plan.operatingDays().get(Country.CHINA)).isEqualTo(1);
		assertThat(plan.operatingDays().get(Country.JAPAN)).isZero();
		assertThat(plan.operatingDays().get(Country.VIETNAM)).isZero();
		assertThat(plan.operatingDays().get(Country.INDONESIA)).isZero();
		assertThat(plan.operatingCost()).isEqualTo(OPERATING_DAILY);
		assertThat(plan.totalCost()).isEqualTo(400L * 1000 * 700 + 2 * 100_000_000L + OPERATING_DAILY);
	}

	@Test
	void operatingDaysExcludeWaitingAfterProductionEnds() {
		// 베트남 2000K / 200K일 = 10일 생산(0~9일). 15일차 귀환까지 걸리지만 운영일수는 10일
		Plan plan = Planner.plan(master(1), orders(0, 0, 2000, 0)).get(0);
		assertThat(plan.totalDays()).isEqualTo(15);
		assertThat(plan.operatingDays().get(Country.VIETNAM)).isEqualTo(10);
		assertThat(plan.operatingCost()).isEqualTo(10 * OPERATING_DAILY);
	}

	@Test
	void operatingDaysIncludeWaitingWhileWarehouseIsFull() {
		// 일본 4500K, 재고 상한 2000K: 상한에 닿아 쉬는 날이 생산 도중에 생긴다. 그 날은 운영일수에 포함
		Plan plan = Planner.plan(master(1), orders(0, 4500, 0, 0)).get(0);
		int[] pr = plan.production().get(Country.JAPAN);
		int last = lastProductionDay(plan, Country.JAPAN);
		boolean idleInside = false;
		for (int t = 0; t < last; t++) {
			idleInside |= pr[t] == 0;
		}
		assertThat(idleInside).as("생산 도중 창고가 가득 차 쉬는 날").isTrue();
		assertThat(plan.operatingDays().get(Country.JAPAN)).isEqualTo(last + 1);
		assertThat(plan.totalDays()).isGreaterThan(last + 1);
		assertThat(plan.operatingCost()).isEqualTo((last + 1) * OPERATING_DAILY);
	}

	@Test
	void totalCostIsProductionPlusShippingPlusOperating() {
		for (Plan plan : Planner.plan(master(3), orders(3000, 1000, 0, 7000))) {
			long operating = 0;
			for (Country c : Country.factories()) {
				operating += plan.operatingDays().get(c) * OPERATING_DAILY;
			}
			assertThat(plan.operatingCost()).as(plan.label()).isEqualTo(operating);
			assertThat(plan.totalCost()).as(plan.label())
					.isEqualTo(plan.productionCost() + plan.shippingCost() + operating);
		}
	}

	@Test
	void operatingCostUsesEachFactorysDailyCost() {
		Master m = new Master(1, 1, 100_000_000L,
				List.of(new FactoryParam(Country.CHINA, 400, 4000, 700, 300_000_000L),
						new FactoryParam(Country.JAPAN, 800, 2000, 900, 50_000_000L),
						new FactoryParam(Country.VIETNAM, 200, 10000, 550, OPERATING_DAILY),
						new FactoryParam(Country.INDONESIA, 300, 7000, 450, OPERATING_DAILY)),
				master(1).routes());
		Plan plan = Planner.plan(m, orders(400, 800, 0, 0)).get(0);
		assertThat(plan.operatingDays().get(Country.CHINA)).isEqualTo(1);
		assertThat(plan.operatingDays().get(Country.JAPAN)).isEqualTo(1);
		assertThat(plan.operatingCost()).isEqualTo(300_000_000L + 50_000_000L);
	}

	@Test
	void costOptionMinimizesShippingPlusOperatingAndFastOptionMinimizesDays() {
		for (Map<Country, Integer> o : List.of(orders(3000, 3000, 3000, 3000), orders(9000, 1000, 6000, 12000),
				orders(4500, 0, 20000, 800))) {
			List<Plan> plans = Planner.plan(master(3), o);
			Plan cost = plans.get(0);
			Plan fast = plans.get(1);
			Plan near = plans.get(2);
			long costVar = cost.shippingCost() + cost.operatingCost();
			assertThat(costVar).isLessThanOrEqualTo(fast.shippingCost() + fast.operatingCost());
			assertThat(costVar).isLessThanOrEqualTo(near.shippingCost() + near.operatingCost());
			assertThat(fast.totalDays()).isLessThanOrEqualTo(cost.totalDays()).isLessThanOrEqualTo(near.totalDays());
			if (fast.totalDays() == cost.totalDays()) {
				assertThat(fast.totalCost()).isLessThanOrEqualTo(cost.totalCost());
			}
		}
	}
}
