package com.example.demo.config;

import com.example.demo.service.MasterInitService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class DataInitializer implements ApplicationRunner {

	private final MasterInitService service;

	public DataInitializer(MasterInitService service) {
		this.service = service;
	}

	@Override
	public void run(ApplicationArguments args) {
		service.initDefaults();
	}
}
