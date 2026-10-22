package com.example.demo.service;

import com.example.demo.entity.Country;
import com.example.demo.entity.Factory;
import com.example.demo.entity.Route;
import com.example.demo.entity.Setting;
import com.example.demo.repository.FactoryRepository;
import com.example.demo.repository.RouteRepository;
import com.example.demo.repository.SettingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MasterInitService {

	private final FactoryRepository factories;
	private final RouteRepository routes;
	private final SettingRepository settings;

	public MasterInitService(FactoryRepository factories, RouteRepository routes, SettingRepository settings) {
		this.factories = factories;
		this.routes = routes;
		this.settings = settings;
	}

	/**
	 * 마스터 데이터가 비어 있으면 초기값을 넣는다. 이미 마스터가 있으면 아무것도 바꾸지 않으므로, 기본값을
	 * 바꿔도 기존 DB 의 공장 값은 그대로다(마스터 화면에서 바꾼다). 공장 4곳의 하루 운영비는 의도적으로
	 * 같은 기본값이다.
	 */
	@Transactional
	public void initDefaults() {
		if (settings.count() > 0) {
			return;
		}
		factories.save(new Factory(Country.CHINA, 400, 4000, 700, Factory.DEFAULT_OPERATING_DAILY_COST_WON));
		factories.save(new Factory(Country.JAPAN, 800, 2000, 900, Factory.DEFAULT_OPERATING_DAILY_COST_WON));
		factories.save(new Factory(Country.VIETNAM, 200, 10000, 550, Factory.DEFAULT_OPERATING_DAILY_COST_WON));
		factories.save(new Factory(Country.INDONESIA, 300, 7000, 450, Factory.DEFAULT_OPERATING_DAILY_COST_WON));

		routes.save(new Route(Country.KOREA, Country.CHINA, 1));
		routes.save(new Route(Country.KOREA, Country.JAPAN, 2));
		routes.save(new Route(Country.KOREA, Country.VIETNAM, 5));
		routes.save(new Route(Country.KOREA, Country.INDONESIA, 7));
		routes.save(new Route(Country.CHINA, Country.JAPAN, 2));
		routes.save(new Route(Country.CHINA, Country.VIETNAM, 4));
		routes.save(new Route(Country.CHINA, Country.INDONESIA, 6));
		routes.save(new Route(Country.JAPAN, Country.VIETNAM, 5));
		routes.save(new Route(Country.JAPAN, Country.INDONESIA, 7));
		routes.save(new Route(Country.VIETNAM, Country.INDONESIA, 2));

		settings.save(new Setting(3, MasterService.WON_PER_EOK));
	}
}
