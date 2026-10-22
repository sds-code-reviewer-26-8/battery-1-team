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

	/** 마스터 데이터가 비어 있으면 초기값을 넣는다. */
	@Transactional
	public void initDefaults() {
		if (settings.count() > 0) {
			return;
		}
		factories.save(new Factory(Country.CHINA, 400, 4000, 700));
		factories.save(new Factory(Country.JAPAN, 800, 2000, 900));
		factories.save(new Factory(Country.VIETNAM, 200, 10000, 550));
		factories.save(new Factory(Country.INDONESIA, 300, 7000, 450));

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
