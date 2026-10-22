package com.example.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.demo.service.BusinessException;
import com.example.demo.service.DueDays;
import com.example.demo.service.OrderService;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class DueDaysTest {

	private static final String EXPECTED = "납기일은 5일 이상 50일 이하의 정수로 입력하세요.";
	private static final String ORDERS = """
			{"CHINA":3000,"JAPAN":3000,"VIETNAM":3000,"INDONESIA":3000}""";

	@Autowired
	MockMvc mvc;
	@Autowired
	OrderService orderService;

	private MockHttpSession login() throws Exception {
		MockHttpSession s = new MockHttpSession();
		mvc.perform(post("/login").param("username", "admin").param("password", "admin").session(s))
				.andExpect(redirectedUrl("/orders"));
		return s;
	}

	@Test
	void rangeAndMessageAreUnchanged() {
		assertThat(DueDays.MIN).isEqualTo(5);
		assertThat(DueDays.MAX).isEqualTo(50);
		assertThat(DueDays.MESSAGE).isEqualTo(EXPECTED);
	}

	@Test
	void inRangeBoundaries() {
		for (int d : new int[] {5, 6, 49, 50}) assertThat(DueDays.inRange(d)).as("" + d).isTrue();
		for (int d : new int[] {Integer.MIN_VALUE, -1, 0, 4, 51, Integer.MAX_VALUE}) {
			assertThat(DueDays.inRange(d)).as("" + d).isFalse();
		}
	}

	@Test
	void serviceRejectsOutOfRangeWithSameMessage() {
		for (int d : new int[] {4, 51}) {
			assertThatThrownBy(() -> orderService.confirm(Map.of(), "FAST", 0L, null, d, "admin"))
					.isInstanceOf(BusinessException.class).hasMessage(EXPECTED);
		}
	}

	@Test
	void dueRuleEndpointReturnsServerRange() throws Exception {
		mvc.perform(get("/api/orders/due-rule").session(login())).andExpect(status().isOk())
				.andExpect(jsonPath("$.min").value(5)).andExpect(jsonPath("$.max").value(50))
				.andExpect(jsonPath("$.message").value(EXPECTED));
	}

	@Test
	void dueRuleEndpointRequiresLogin() throws Exception {
		mvc.perform(get("/api/orders/due-rule")).andExpect(status().is4xxClientError());
	}

	@Test
	void dueRuleDoesNotShadowOrderDetail() throws Exception {
		mvc.perform(get("/api/orders/999999").session(login())).andExpect(status().is4xxClientError());
	}

	@Test
	void apiRejectsWithSameMessageForRangeAndNonInteger() throws Exception {
		MockHttpSession s = login();
		MvcResult sim = mvc.perform(post("/api/simulate").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + "}")).andReturn();
		int version = com.jayway.jsonpath.JsonPath.read(sim.getResponse().getContentAsString(), "$.master.version");
		for (String due : new String[] {"4", "51", "7.5", "\"10\""}) {
			mvc.perform(post("/api/orders").session(s).contentType(MediaType.APPLICATION_JSON)
					.content("{\"orders\":" + ORDERS + ",\"routeType\":\"FAST\",\"masterVersion\":" + version
							+ ",\"dueDays\":" + due + "}"))
					.andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value(EXPECTED));
		}
	}

	@Test
	void detailJsonKeepsFieldNamesAndValues() throws Exception {
		MockHttpSession s = login();
		MvcResult sim = mvc.perform(post("/api/simulate").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + "}")).andReturn();
		int version = com.jayway.jsonpath.JsonPath.read(sim.getResponse().getContentAsString(), "$.master.version");
		MvcResult res = mvc.perform(post("/api/orders").session(s).contentType(MediaType.APPLICATION_JSON)
				.content("{\"orders\":" + ORDERS + ",\"routeType\":\"FAST\",\"masterVersion\":" + version
						+ ",\"memo\":\"m1\",\"dueDays\":7}")).andReturn();
		Integer id = com.jayway.jsonpath.JsonPath.read(res.getResponse().getContentAsString(), "$.id");
		mvc.perform(get("/api/orders/" + id).session(s)).andExpect(status().isOk())
				.andExpect(jsonPath("$.dueDays").value(7)).andExpect(jsonPath("$.memo").value("m1"))
				.andExpect(jsonPath("$.version").isNumber()).andExpect(jsonPath("$.routeLabel").isString())
				.andExpect(jsonPath("$.createdBy").value("admin")).andExpect(jsonPath("$.plan").exists())
				.andExpect(jsonPath("$.history").isArray()).andExpect(jsonPath("$.next").isArray());
	}
}
