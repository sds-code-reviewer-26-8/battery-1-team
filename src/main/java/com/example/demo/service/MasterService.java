package com.example.demo.service;

import com.example.demo.entity.Country;
import com.example.demo.entity.Factory;
import com.example.demo.entity.Route;
import com.example.demo.entity.Setting;
import com.example.demo.repository.FactoryRepository;
import com.example.demo.repository.RouteRepository;
import com.example.demo.repository.SettingRepository;
import com.example.demo.simulation.Master;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MasterService {

	public static final long WON_PER_EOK = 100_000_000L;
	private static final int MAX_SHIPS = 4;
	/** 하루 비용(운항비·공장 운영비) 입력의 상한(억 원). 원 단위 long 계산이 넘치지 않도록 정한다. */
	private static final long MAX_DAILY_COST_EOK = 1_000;

	private final FactoryRepository factories;
	private final RouteRepository routes;
	private final SettingRepository settings;

	public MasterService(FactoryRepository factories, RouteRepository routes, SettingRepository settings) {
		this.factories = factories;
		this.routes = routes;
		this.settings = settings;
	}

	@Transactional(readOnly = true)
	public Master currentMaster() {
		Setting s = settings.findById(Setting.SINGLETON_ID)
				.orElseThrow(() -> new IllegalStateException("마스터 데이터가 초기화되지 않았습니다"));
		List<Master.FactoryParam> fs = factories.findAll().stream()
				.sorted(Comparator.comparing(Factory::getCountry))
				.map(f -> new Master.FactoryParam(f.getCountry(), f.getMaxDaily(), f.getStockLimit(), f.getUnitCost(),
						f.getOperatingDailyCost()))
				.toList();
		List<Master.RouteParam> rs = routes.findAll().stream()
				.sorted(Comparator.comparing(Route::getFromCountry).thenComparing(Route::getToCountry))
				.map(r -> new Master.RouteParam(r.getFromCountry(), r.getToCountry(), r.getDays()))
				.toList();
		return new Master(s.getMasterVersion(), s.getShipCount(), s.getShipDailyCostWon(), fs, rs);
	}

	/** 항로 입력칸 이름 (from, to 는 ordinal 순) */
	public static String routeKey(Country a, Country b) {
		return a.ordinal() < b.ordinal() ? "days_" + a + "_" + b : "days_" + b + "_" + a;
	}

	/**
	 * 폼 값을 검증하고 저장한다. 올바르지 않은 값이 하나라도 있으면 아무것도 저장하지 않고
	 * 이유를 모아 {@link BusinessException} 으로 알린다.
	 */
	@Transactional
	public void updateMaster(Map<String, String> form) {
		List<String> errors = new ArrayList<>();

		int shipCount = parseInt(form, "shipCount", "배 척수", 1, MAX_SHIPS, errors);
		long shipCostWon = parseEok(form.getOrDefault("shipDailyCost", ""), "척당 일 운항비", MAX_DAILY_COST_EOK, errors);

		Map<Country, int[]> factoryValues = new EnumMap<>(Country.class);
		Map<Country, Long> unitCosts = new EnumMap<>(Country.class);
		Map<Country, Long> operatingCosts = new EnumMap<>(Country.class);
		for (Country c : Country.factories()) {
			String name = c.getLabel();
			int max = parseInt(form, "maxDaily_" + c, name + " 하루 최대 생산량", 1, 1_000_000, errors);
			int limit = parseInt(form, "stockLimit_" + c, name + " 재고 상한", 1, 1_000_000, errors);
			int cost = parseInt(form, "unitCost_" + c, name + " 셀당 원가", 1, 100_000_000, errors);
			factoryValues.put(c, new int[] {max, limit});
			unitCosts.put(c, (long) cost);
			operatingCosts.put(c, parseEok(form.getOrDefault("operatingDailyCost_" + c, ""), name + " 하루 운영비",
					MAX_DAILY_COST_EOK, errors));
		}

		List<Country> all = List.of(Country.values());
		Map<String, Integer> days = new HashMap<>();
		for (int i = 0; i < all.size(); i++) {
			for (int j = i + 1; j < all.size(); j++) {
				String key = routeKey(all.get(i), all.get(j));
				String label = all.get(i).getLabel() + "-" + all.get(j).getLabel() + " 항해 일수";
				days.put(key, parseInt(form, key, label, 1, 365, errors));
			}
		}

		if (!errors.isEmpty()) {
			throw new BusinessException(errors);
		}

		for (Country c : Country.factories()) {
			Factory f = factories.findById(c).orElseThrow();
			f.setMaxDaily(factoryValues.get(c)[0]);
			f.setStockLimit(factoryValues.get(c)[1]);
			f.setUnitCost(unitCosts.get(c));
			f.setOperatingDailyCost(operatingCosts.get(c));
		}
		for (Route r : routes.findAll()) {
			r.setDays(days.get(routeKey(r.getFromCountry(), r.getToCountry())));
		}
		Setting s = settings.findById(Setting.SINGLETON_ID).orElseThrow();
		s.setShipCount(shipCount);
		s.setShipDailyCostWon(shipCostWon);
		s.bumpMasterVersion();
	}

	/**
	 * 억 원 단위 입력(소수 가능)을 원으로 바꾼다. 0 보다 크고 maxEok 이하여야 한다. 올바르지 않으면 이유를
	 * errors 에 담고 0 을 돌려준다.
	 */
	private static long parseEok(String text, String label, long maxEok, List<String> errors) {
		try {
			BigDecimal eok = new BigDecimal(text.trim());
			if (eok.signum() <= 0) {
				errors.add(label + "는 0보다 커야 합니다");
			} else if (eok.compareTo(BigDecimal.valueOf(maxEok)) > 0) {
				errors.add("%s는 %,d억 원 이하여야 합니다".formatted(label, maxEok));
			} else if (eok.multiply(BigDecimal.valueOf(WON_PER_EOK)).stripTrailingZeros().scale() > 0) {
				errors.add(label + "는 원 단위로 떨어지는 값이어야 합니다");
			} else {
				return eok.multiply(BigDecimal.valueOf(WON_PER_EOK)).longValueExact();
			}
		} catch (NumberFormatException | ArithmeticException e) {
			errors.add(label + "(억 원)는 숫자로 입력하세요");
		}
		return 0;
	}

	private static int parseInt(Map<String, String> form, String key, String label, int min, int max,
			List<String> errors) {
		String text = form.getOrDefault(key, "").trim().replace(",", "");
		try {
			int v = Integer.parseInt(text);
			if (v < min || v > max) {
				errors.add("%s은(는) %d 이상 %d 이하의 정수여야 합니다".formatted(label, min, max));
			}
			return v;
		} catch (NumberFormatException e) {
			errors.add("%s은(는) 정수로 입력하세요".formatted(label));
			return min;
		}
	}
}
