package com.example.demo.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class OrderStatusTest {

	@Test
	@DisplayName("확정·진행은 수정할 수 있고, 완료·취소는 수정할 수 없다")
	void editableOnlyBeforeCompletedOrCanceled() {
		assertThat(OrderStatus.CONFIRMED.isEditable()).isTrue();
		assertThat(OrderStatus.IN_PROGRESS.isEditable()).isTrue();
		assertThat(OrderStatus.COMPLETED.isEditable()).isFalse();
		assertThat(OrderStatus.CANCELED.isEditable()).isFalse();
	}
}
