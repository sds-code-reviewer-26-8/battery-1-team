package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.nullValue;

import com.example.demo.entity.OrderStatus;
import com.example.demo.service.BusinessException;
import com.example.demo.service.OrderService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@AutoConfigureMockMvc
class OrderFlowTests {

	private static final String ORDERS = """
			{"CHINA":3000,"JAPAN":3000,"VIETNAM":3000,"INDONESIA":3000}""";

	@Autowired
	MockMvc mvc;
	@Autowired
	OrderService orderService;

	private MockHttpSession login() throws Exception {
		MockHttpSession session = new MockHttpSession();
		mvc.perform(post("/login").param("username", "admin").param("password", "admin").session(session))
				.andExpect(redirectedUrl("/orders"));
		return session;
	}

	@Test
	void anonymousUserIsSentToLogin() throws Exception {
		mvc.perform(get("/orders")).andExpect(redirectedUrl("/login"));
		mvc.perform(post("/api/simulate").contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isUnauthorized());
		mvc.perform(get("/login")).andExpect(status().isOk());
	}

	@Test
	void wrongPasswordIsRejected() throws Exception {
		mvc.perform(post("/login").param("username", "admin").param("password", "x"))
				.andExpect(status().isOk());
		mvc.perform(post("/login").param("username", "other").param("password", "admin"))
				.andExpect(status().isOk());
	}

	@Test
	void signedUpMemberCanLoginAndUseApis() throws Exception {
		mvc.perform(get("/signup")).andExpect(status().isOk());
		mvc.perform(post("/signup").param("username", "alice").param("password", "pw1234"))
				.andExpect(status().isCreated());
		mvc.perform(post("/signup").param("username", "alice").param("password", "pw1234"))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").exists());
		mvc.perform(post("/signup").param("username", " ").param("password", "pw1234"))
				.andExpect(status().isBadRequest());
		mvc.perform(post("/signup").param("username", "bob").param("password", "12"))
				.andExpect(status().isBadRequest());
		mvc.perform(post("/signup").param("username", "admin").param("password", "pw1234"))
				.andExpect(status().isBadRequest());
		mvc.perform(post("/login").param("username", "alice").param("password", "wrong"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.error").exists());
		MockHttpSession s = new MockHttpSession();
		mvc.perform(post("/login").param("username", "alice").param("password", "pw1234").session(s))
				.andExpect(redirectedUrl("/orders"));
		mvc.perform(post("/api/simulate").session(s).contentType(MediaType.APPLICATION_JSON)
						.content("{\"orders\":" + ORDERS + "}"))
				.andExpect(status().isOk());
		mvc.perform(get("/master").session(s)).andExpect(status().isOk());
	}

	@Test
	void usernameIsCaseInsensitiveAndPasswordHasMaxLength() throws Exception {
		mvc.perform(post("/signup").param("username", "Carol").param("password", "pw1234"))
				.andExpect(status().isCreated());
		mvc.perform(post("/signup").param("username", "carol").param("password", "pw1234"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").value("이미 사용 중인 아이디입니다"));
		mvc.perform(post("/login").param("username", "CAROL").param("password", "pw1234"))
				.andExpect(redirectedUrl("/orders"));
		mvc.perform(post("/signup").param("username", "ADMIN").param("password", "pw1234"))
				.andExpect(status().isBadRequest());
		mvc.perform(post("/login").param("username", "Admin").param("password", "admin"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.error").exists());
		mvc.perform(post("/login").param("username", "admin").param("password", "admin"))
				.andExpect(redirectedUrl("/orders"));

		mvc.perform(post("/signup").param("username", "dave").param("password", "p".repeat(64)))
				.andExpect(status().isCreated());
		mvc.perform(post("/signup").param("username", "erin").param("password", "p".repeat(65)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").value("비밀번호는 64자 이하여야 합니다"));
		mvc.perform(post("/signup").param("username", "erin").param("password", "abc"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").value("비밀번호는 4자 이상이어야 합니다"));
	}

	@Test
	void pagesRender()throws Exception {
		MockHttpSession s = login();
		for (String url : new String[] {"/orders", "/orders/new", "/master"}) {
			mvc.perform(get(url).session(s)).andExpect(status().isOk());
		}
	}

	@Test
	void simulateReturnsThreeOptions() throws Exception {
		mvc.perform(post("/api/simulate").session(login()).contentType(MediaType.APPLICATION_JSON)
						.content("{\"orders\":" + ORDERS + "}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.options.length()").value(3))
				.andExpect(jsonPath("$.options[0].type").value("COST"))
				.andExpect(jsonPath("$.options[0].stock.CHINA").isArray())
				.andExpect(jsonPath("$.visits.JAPAN").value(2))
				.andExpect(jsonPath("$.master.factories.length()").value(4));
	}

	@Test
	void emptyOrderIsRejectedWithReason() throws Exception {
		mvc.perform(post("/api/simulate").session(login()).contentType(MediaType.APPLICATION_JSON)
						.content("{\"orders\":{\"CHINA\":0}}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error").exists());
	}

	private long confirm(MockHttpSession s) throws Exception {
		MvcResult sim = mvc.perform(post("/api/simulate").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + "}")).andReturn();
		int version = com.jayway.jsonpath.JsonPath.read(sim.getResponse().getContentAsString(), "$.master.version");
		MvcResult res = mvc.perform(post("/api/orders").session(s).contentType(MediaType.APPLICATION_JSON)
						.content("{\"orders\":" + ORDERS + ",\"routeType\":\"FAST\",\"masterVersion\":" + version
								+ ",\"memo\":\"테스트\"}"))
				.andExpect(status().isOk()).andReturn();
		Integer id = com.jayway.jsonpath.JsonPath.read(res.getResponse().getContentAsString(), "$.id");
		return id;
	}

	private long confirmWithCustomer(MockHttpSession s, String customerFragment) throws Exception {
		MvcResult sim = mvc.perform(post("/api/simulate").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + "}")).andReturn();
		int version = com.jayway.jsonpath.JsonPath.read(sim.getResponse().getContentAsString(), "$.master.version");
		MvcResult res = mvc.perform(post("/api/orders").session(s).contentType(MediaType.APPLICATION_JSON)
						.content("{\"orders\":" + ORDERS + ",\"routeType\":\"FAST\",\"masterVersion\":" + version
								+ ",\"memo\":\"테스트\"" + customerFragment + "}"))
				.andExpect(status().isOk()).andReturn();
		Integer id = com.jayway.jsonpath.JsonPath.read(res.getResponse().getContentAsString(), "$.id");
		return id;
	}

	@Test
	@DisplayName("[기준1] 고객사 이름과 함께 확정하면 상세 조회에 그대로 반환된다")
	void confirmWithCustomerNameReturnsItInDetail() throws Exception {
		MockHttpSession s = login();
		long id = confirmWithCustomer(s, ",\"customerName\":\"ACME\"");

		mvc.perform(get("/api/orders/" + id).session(s))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.customerName").value("ACME"));
	}

	@Test
	@DisplayName("[기준2] 고객사 이름 없이 확정하면 상세 조회의 customerName은 null이다")
	void confirmWithoutCustomerNameReturnsNullInDetail() throws Exception {
		MockHttpSession s = login();
		long id = confirmWithCustomer(s, "");

		mvc.perform(get("/api/orders/" + id).session(s))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.customerName").value(nullValue()));
	}

	@Test
	@DisplayName("[기준9] 주문 목록 API 각 행에 customerName이 포함된다")
	void orderListRowsIncludeCustomerName() throws Exception {
		MockHttpSession s = login();
		long named = confirmWithCustomer(s, ",\"customerName\":\"LIST-CO\"");
		long unnamed = confirmWithCustomer(s, "");

		mvc.perform(get("/api/orders").session(s))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.orders[?(@.id==" + named + ")].customerName").value(contains("LIST-CO")))
				.andExpect(jsonPath("$.orders[?(@.id==" + unnamed + ")].customerName").value(contains(nullValue())));
	}

	@Test
	@DisplayName("[기준11] 고객사 이름 없이 확정한 주문도 상태 변경 후 상세 조회가 이름 null로 정상 동작한다")
	void legacyFlowWithoutCustomerNameStillWorks() throws Exception {
		MockHttpSession s = login();
		long id = confirmWithCustomer(s, "");

		orderService.changeStatus(id, OrderStatus.IN_PROGRESS, orderService.getOrder(id).getVersion(), "admin");

		assertThat(orderService.getOrder(id).getStatus()).isEqualTo(OrderStatus.IN_PROGRESS);
		mvc.perform(get("/api/orders/" + id).session(s))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.customerName").value(nullValue()));
	}

	private org.springframework.test.web.servlet.ResultActions editCustomer(MockHttpSession s, long id, String name,
			long version) throws Exception {
		String nameJson = name == null ? "null" : "\"" + name + "\"";
		return mvc.perform(post("/api/orders/" + id + "/customer").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"customerName\":" + nameJson + ",\"version\":" + version + "}"));
	}

	private org.springframework.test.web.servlet.ResultActions confirmRaw(MockHttpSession s, String customerFragment)
			throws Exception {
		MvcResult sim = mvc.perform(post("/api/simulate").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + "}")).andReturn();
		int version = com.jayway.jsonpath.JsonPath.read(sim.getResponse().getContentAsString(), "$.master.version");
		return mvc.perform(post("/api/orders").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + ",\"routeType\":\"FAST\",\"masterVersion\":" + version
						+ customerFragment + "}"));
	}

	@Test
	@DisplayName("고객사 이름의 앞뒤 공백은 제거하고, 공백뿐이면 null로 확정된다")
	void confirmTrimsCustomerNameAndBlankBecomesNull() throws Exception {
		MockHttpSession s = login();
		long trimmed = confirmWithCustomer(s, ",\"customerName\":\"  ACME  \"");
		long blank = confirmWithCustomer(s, ",\"customerName\":\"   \"");

		mvc.perform(get("/api/orders/" + trimmed).session(s)).andExpect(jsonPath("$.customerName").value("ACME"));
		mvc.perform(get("/api/orders/" + blank).session(s)).andExpect(jsonPath("$.customerName").value(nullValue()));
	}

	@Test
	@DisplayName("고객사 이름은 100자까지 확정되고, 101자는 400으로 거부된다")
	void confirmCustomerNameLengthLimit() throws Exception {
		MockHttpSession s = login();
		long id = confirmWithCustomer(s, ",\"customerName\":\"" + "가".repeat(100) + "\"");
		mvc.perform(get("/api/orders/" + id).session(s)).andExpect(jsonPath("$.customerName").value("가".repeat(100)));

		confirmRaw(s, ",\"customerName\":\"" + "가".repeat(101) + "\"")
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").exists());
	}

	@Test
	@DisplayName("고객사 이름 수정도 공백을 제거하고, 공백뿐이면 null이 되며, 101자는 거부되고 기존 이름이 유지된다")
	void editCustomerNameNormalizesAndLimitsLength() throws Exception {
		MockHttpSession s = login();
		long id = confirmWithCustomer(s, ",\"customerName\":\"OLD\"");

		editCustomer(s, id, "  NEW  ", orderService.getOrder(id).getVersion()).andExpect(status().isOk());
		mvc.perform(get("/api/orders/" + id).session(s)).andExpect(jsonPath("$.customerName").value("NEW"));

		editCustomer(s, id, "가".repeat(101), orderService.getOrder(id).getVersion())
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").exists());
		mvc.perform(get("/api/orders/" + id).session(s)).andExpect(jsonPath("$.customerName").value("NEW"));

		editCustomer(s, id, "   ", orderService.getOrder(id).getVersion()).andExpect(status().isOk());
		mvc.perform(get("/api/orders/" + id).session(s)).andExpect(jsonPath("$.customerName").value(nullValue()));
	}

	@Test
	@DisplayName("[기준3] 확정 주문의 고객사 이름을 주문 version과 함께 수정하면 반영되고 주문 version이 증가한다")
	void editCustomerNameOfConfirmedOrderSucceeds() throws Exception {
		MockHttpSession s = login();
		long id = confirmWithCustomer(s, ",\"customerName\":\"OLD\"");
		long before = orderService.getOrder(id).getVersion();

		editCustomer(s, id, "NEW", before).andExpect(status().isOk()).andExpect(jsonPath("$.message").exists());

		mvc.perform(get("/api/orders/" + id).session(s)).andExpect(jsonPath("$.customerName").value("NEW"));
		assertThat(orderService.getOrder(id).getVersion()).isGreaterThan(before);
	}

	@Test
	@DisplayName("[기준4] 진행 주문의 고객사 이름도 수정할 수 있다")
	void editCustomerNameOfInProgressOrderSucceeds() throws Exception {
		MockHttpSession s = login();
		long id = confirmWithCustomer(s, ",\"customerName\":\"OLD\"");
		orderService.changeStatus(id, OrderStatus.IN_PROGRESS, orderService.getOrder(id).getVersion(), "admin");

		editCustomer(s, id, "NEW", orderService.getOrder(id).getVersion()).andExpect(status().isOk());

		mvc.perform(get("/api/orders/" + id).session(s)).andExpect(jsonPath("$.customerName").value("NEW"));
	}

	@Test
	@DisplayName("[기준5] 완료 주문의 고객사 이름 수정은 거부되고 이름이 바뀌지 않는다")
	void editCustomerNameOfCompletedOrderIsRejected() throws Exception {
		MockHttpSession s = login();
		long id = confirmWithCustomer(s, ",\"customerName\":\"OLD\"");
		orderService.changeStatus(id, OrderStatus.IN_PROGRESS, orderService.getOrder(id).getVersion(), "admin");
		orderService.changeStatus(id, OrderStatus.COMPLETED, orderService.getOrder(id).getVersion(), "admin");

		editCustomer(s, id, "NEW", orderService.getOrder(id).getVersion()).andExpect(status().is4xxClientError())
				.andExpect(jsonPath("$.message").exists());

		mvc.perform(get("/api/orders/" + id).session(s)).andExpect(jsonPath("$.customerName").value("OLD"));
	}

	@Test
	@DisplayName("[기준6] 취소 주문의 고객사 이름 수정은 거부되고 이름이 바뀌지 않는다")
	void editCustomerNameOfCanceledOrderIsRejected() throws Exception {
		MockHttpSession s = login();
		long id = confirmWithCustomer(s, ",\"customerName\":\"OLD\"");
		orderService.changeStatus(id, OrderStatus.CANCELED, orderService.getOrder(id).getVersion(), "admin");

		editCustomer(s, id, "NEW", orderService.getOrder(id).getVersion()).andExpect(status().is4xxClientError())
				.andExpect(jsonPath("$.message").exists());

		mvc.perform(get("/api/orders/" + id).session(s)).andExpect(jsonPath("$.customerName").value("OLD"));
	}

	@Test
	@DisplayName("[기준7] 오래된 주문 version(그 사이 다른 변경으로 올라감)으로 이름을 수정하면 409로 거부되고 이름이 바뀌지 않는다")
	void editCustomerNameWithStaleVersionIsConflict() throws Exception {
		MockHttpSession s = login();
		long id = confirmWithCustomer(s, ",\"customerName\":\"OLD\"");
		long stale = orderService.getOrder(id).getVersion();
		orderService.changeStatus(id, OrderStatus.IN_PROGRESS, stale, "admin");

		editCustomer(s, id, "NEW", stale).andExpect(status().isConflict());

		mvc.perform(get("/api/orders/" + id).session(s)).andExpect(jsonPath("$.customerName").value("OLD"));
	}

	@Test
	@DisplayName("[기준8] 존재하지 않는 주문의 이름 수정은 오류로 거부된다")
	void editCustomerNameOfMissingOrderIsRejected() throws Exception {
		editCustomer(login(), 999_999_999L, "NEW", 0).andExpect(status().is4xxClientError())
				.andExpect(jsonPath("$.message").exists());
	}

	@Test
	@DisplayName("[기준10] 상세 조회의 editable은 확정·진행이면 true이다")
	void detailEditableIsTrueForConfirmedAndInProgress() throws Exception {
		MockHttpSession s = login();
		long id = confirm(s);
		mvc.perform(get("/api/orders/" + id).session(s)).andExpect(jsonPath("$.editable").value(true));

		orderService.changeStatus(id, OrderStatus.IN_PROGRESS, orderService.getOrder(id).getVersion(), "admin");
		mvc.perform(get("/api/orders/" + id).session(s)).andExpect(jsonPath("$.editable").value(true));
	}

	@Test
	@DisplayName("[기준10] 상세 조회의 editable은 완료·취소이면 false이다")
	void detailEditableIsFalseForCompletedAndCanceled() throws Exception {
		MockHttpSession s = login();
		long done = confirm(s);
		orderService.changeStatus(done, OrderStatus.IN_PROGRESS, orderService.getOrder(done).getVersion(), "admin");
		orderService.changeStatus(done, OrderStatus.COMPLETED, orderService.getOrder(done).getVersion(), "admin");
		long canceled = confirm(s);
		orderService.changeStatus(canceled, OrderStatus.CANCELED, orderService.getOrder(canceled).getVersion(),
				"admin");

		mvc.perform(get("/api/orders/" + done).session(s)).andExpect(jsonPath("$.editable").value(false));
		mvc.perform(get("/api/orders/" + canceled).session(s)).andExpect(jsonPath("$.editable").value(false));
	}

	@Test
	@DisplayName("[기준12] 로그인하지 않고 이름 수정을 요청하면 401이다")
	void editCustomerNameWithoutLoginIsUnauthorized() throws Exception {
		MockHttpSession s = login();
		long id = confirmWithCustomer(s, ",\"customerName\":\"OLD\"");
		long version = orderService.getOrder(id).getVersion();

		// 로그인 없이는 401, 같은 요청도 로그인하면 성공해야 401의 원인이 로그인 여부임을 확인한다
		mvc.perform(post("/api/orders/" + id + "/customer").contentType(MediaType.APPLICATION_JSON)
				.content("{\"customerName\":\"NEW\",\"version\":" + version + "}"))
				.andExpect(status().isUnauthorized());
		editCustomer(s, id, "NEW", version).andExpect(status().isOk());
	}

	@Test
	void confirmThenDetailAndStatusFlow() throws Exception {
		MockHttpSession s = login();
		long id = confirm(s);

		mvc.perform(get("/orders/" + id).session(s)).andExpect(status().isOk());
		var order = orderService.getOrder(id);
		assertThat(order.getStatus()).isEqualTo(OrderStatus.CONFIRMED);
		assertThat(order.getPlanJson()).contains("\"master\"").contains("\"plan\"");

		// 확정 → 완료는 불가
		assertThatThrownBy(() -> orderService.changeStatus(id, OrderStatus.COMPLETED, order.getVersion(), "admin"))
				.isInstanceOf(BusinessException.class);

		orderService.changeStatus(id, OrderStatus.IN_PROGRESS, order.getVersion(), "admin");
		var inProgress = orderService.getOrder(id);
		assertThat(inProgress.getStatus()).isEqualTo(OrderStatus.IN_PROGRESS);

		// 오래된 주문 version 으로 바꾸려 하면 충돌
		assertThatThrownBy(() -> orderService.changeStatus(id, OrderStatus.COMPLETED, order.getVersion(), "admin"))
				.isInstanceOf(BusinessException.class).hasMessageContaining("먼저");

		orderService.changeStatus(id, OrderStatus.COMPLETED, inProgress.getVersion(), "admin");
		assertThat(orderService.history(id)).hasSize(3);

		// 완료는 최종 상태
		var done = orderService.getOrder(id);
		assertThatThrownBy(() -> orderService.changeStatus(id, OrderStatus.CANCELED, done.getVersion(), "admin"))
				.isInstanceOf(BusinessException.class);
	}

	@Test
	void cancelKeepsOrderAndHistory() throws Exception {
		MockHttpSession s = login();
		long id = confirm(s);
		var order = orderService.getOrder(id);

		orderService.changeStatus(id, OrderStatus.CANCELED, order.getVersion(), "admin");

		assertThat(orderService.getOrder(id).getStatus()).isEqualTo(OrderStatus.CANCELED);
		var history = orderService.history(id);
		assertThat(history).hasSize(2);
		assertThat(history.get(1).getToStatus()).isEqualTo(OrderStatus.CANCELED);
	}

	@Test
	void cancelInProgressOrderKeepsOrderAndHistory() throws Exception {
		MockHttpSession s = login();
		long id = confirm(s);
		orderService.changeStatus(id, OrderStatus.IN_PROGRESS, orderService.getOrder(id).getVersion(), "admin");

		orderService.changeStatus(id, OrderStatus.CANCELED, orderService.getOrder(id).getVersion(), "admin");

		assertThat(orderService.getOrder(id).getStatus()).isEqualTo(OrderStatus.CANCELED);
		var history = orderService.history(id);
		assertThat(history).hasSize(3);
		assertThat(history.get(2).getFromStatus()).isEqualTo(OrderStatus.IN_PROGRESS);
		assertThat(history.get(2).getToStatus()).isEqualTo(OrderStatus.CANCELED);
	}

	@Test
	void canceledOrderRejectsFurtherChanges() throws Exception {
		MockHttpSession s = login();
		long id = confirm(s);
		orderService.changeStatus(id, OrderStatus.CANCELED, orderService.getOrder(id).getVersion(), "admin");
		int historyCount = orderService.history(id).size();

		for (OrderStatus target : new OrderStatus[] { OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED,
				OrderStatus.CANCELED }) {
			long version = orderService.getOrder(id).getVersion();
			assertThatThrownBy(() -> orderService.changeStatus(id, target, version, "admin"))
					.isInstanceOf(BusinessException.class);
		}

		assertThat(orderService.getOrder(id).getStatus()).isEqualTo(OrderStatus.CANCELED);
		assertThat(orderService.history(id)).hasSize(historyCount);
	}

	@Test
	void confirmFailsWhenMasterChangedAfterSimulation() throws Exception {
		MockHttpSession s = login();
		mvc.perform(post("/api/orders").session(s).contentType(MediaType.APPLICATION_JSON)
						.content("{\"orders\":" + ORDERS + ",\"routeType\":\"COST\",\"masterVersion\":-1}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.conflict").value(true));
	}

	@Test
	@DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
	void masterUpdateBumpsVersionAndKeepsConfirmedPlans() throws Exception {
		MockHttpSession s = login();
		long id = confirm(s);
		String before = orderService.getOrder(id).getPlanJson();

		var form = post("/master").session(s)
				.param("shipCount", "3").param("shipDailyCost", "1.5");
		for (String c : new String[] {"CHINA", "JAPAN", "VIETNAM", "INDONESIA"}) {
			form.param("maxDaily_" + c, "500").param("stockLimit_" + c, "5000").param("unitCost_" + c, "600")
					.param("operatingDailyCost_" + c, "10");
		}
		String[] all = {"KOREA", "CHINA", "JAPAN", "VIETNAM", "INDONESIA"};
		for (int i = 0; i < all.length; i++) {
			for (int j = i + 1; j < all.length; j++) {
				form.param("days_" + all[i] + "_" + all[j], "3");
			}
		}
		mvc.perform(form).andExpect(redirectedUrl("/master"));

		assertThat(orderService.getOrder(id).getPlanJson()).isEqualTo(before);
		mvc.perform(get("/api/master").session(s))
				.andExpect(jsonPath("$.shipDailyCostWon").value(150_000_000));
	}

	private String masterFormError(MockHttpSession s, String operatingDailyCost) throws Exception {
		var form = post("/master").session(s).param("shipCount", "3").param("shipDailyCost", "1");
		for (String c : new String[] {"CHINA", "JAPAN", "VIETNAM", "INDONESIA"}) {
			form.param("maxDaily_" + c, "500").param("stockLimit_" + c, "5000").param("unitCost_" + c, "600")
					.param("operatingDailyCost_" + c, operatingDailyCost);
		}
		String[] all = {"KOREA", "CHINA", "JAPAN", "VIETNAM", "INDONESIA"};
		for (int i = 0; i < all.length; i++) {
			for (int j = i + 1; j < all.length; j++) {
				form.param("days_" + all[i] + "_" + all[j], "3");
			}
		}
		return mvc.perform(form).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
	}

	@Test
	void masterWithoutOperatingCostIsRejected() throws Exception {
		MockHttpSession s = login();
		// 다른 공장 값과 마찬가지로 하루 운영비도 필수다. 빠져 있으면 아무것도 저장하지 않는다
		var form = post("/master").session(s).param("shipCount", "2").param("shipDailyCost", "1");
		for (String c : new String[] {"CHINA", "JAPAN", "VIETNAM", "INDONESIA"}) {
			form.param("maxDaily_" + c, "500").param("stockLimit_" + c, "5000").param("unitCost_" + c, "600");
		}
		String[] all = {"KOREA", "CHINA", "JAPAN", "VIETNAM", "INDONESIA"};
		for (int i = 0; i < all.length; i++) {
			for (int j = i + 1; j < all.length; j++) {
				form.param("days_" + all[i] + "_" + all[j], "3");
			}
		}
		String body = mvc.perform(form).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		assertThat(body).contains("하루 운영비");
		mvc.perform(get("/api/master").session(s)).andExpect(jsonPath("$.shipCount").value(3));
	}

	@Test
	void operatingCostAboveLimitIsRejectedWithRangeMessage() throws Exception {
		MockHttpSession s = login();
		// 매우 큰 값은 숫자가 아니라는 메시지가 아니라 범위 초과로 알린다
		assertThat(masterFormError(s, "1001")).contains("1,000억 원 이하");
		assertThat(masterFormError(s, "99999999999999999999")).contains("1,000억 원 이하");
		assertThat(masterFormError(s, "abc")).contains("숫자로 입력하세요");
		mvc.perform(get("/api/master").session(s)).andExpect(jsonPath("$.shipCount").value(3));
	}

	@Test
	void invalidMasterIsNotSaved() throws Exception {
		MockHttpSession s = login();
		mvc.perform(post("/master").session(s).param("shipCount", "9").param("shipDailyCost", "abc"))
				.andExpect(status().isOk());
		mvc.perform(get("/api/master").session(s)).andExpect(jsonPath("$.shipCount").value(3));
	}
}
