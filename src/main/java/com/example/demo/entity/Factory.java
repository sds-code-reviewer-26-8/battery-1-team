package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "factory")
public class Factory {

	@Id
	@Enumerated(EnumType.STRING)
	private Country country;

	/** 하루 최대 생산량(K) */
	@Column(nullable = false)
	private int maxDaily;

	/** 재고 상한(K) */
	@Column(nullable = false)
	private int stockLimit;

	/** 셀당 원가(원) */
	@Column(nullable = false)
	private long unitCost;

	/**
	 * 하루 운영비(원). 새 공장은 생성자가 값을 정한다. columnDefinition 의 default 는 ddl-auto=update 로
	 * 기존 DB 에 이 컬럼을 추가할 때 이미 있는 행을 채우기 위한 것이다.
	 */
	@Column(nullable = false, columnDefinition = "bigint default " + DEFAULT_OPERATING_DAILY_COST_WON)
	private long operatingDailyCost;

	/** 하루 운영비 기본값: 10억 원. 초기 데이터와 기존 행 채움이 같은 값을 쓴다. */
	public static final long DEFAULT_OPERATING_DAILY_COST_WON = 1_000_000_000L;

	protected Factory() {
	}

	public Factory(Country country, int maxDaily, int stockLimit, long unitCost, long operatingDailyCost) {
		this.country = country;
		this.operatingDailyCost = operatingDailyCost;
		this.maxDaily = maxDaily;
		this.stockLimit = stockLimit;
		this.unitCost = unitCost;
	}

	public Country getCountry() {
		return country;
	}

	public int getMaxDaily() {
		return maxDaily;
	}

	public void setMaxDaily(int maxDaily) {
		this.maxDaily = maxDaily;
	}

	public int getStockLimit() {
		return stockLimit;
	}

	public void setStockLimit(int stockLimit) {
		this.stockLimit = stockLimit;
	}

	public long getUnitCost() {
		return unitCost;
	}

	public void setUnitCost(long unitCost) {
		this.unitCost = unitCost;
	}

	public long getOperatingDailyCost() {
		return operatingDailyCost;
	}

	public void setOperatingDailyCost(long operatingDailyCost) {
		this.operatingDailyCost = operatingDailyCost;
	}
}
