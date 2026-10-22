package com.example.demo.controller;

import com.example.demo.config.LoginInterceptor;
import com.example.demo.entity.Country;
import com.example.demo.entity.Order;
import com.example.demo.entity.OrderStatus;
import com.example.demo.entity.OrderStatusHistory;
import com.example.demo.service.BusinessException;
import com.example.demo.service.OrderService;
import jakarta.servlet.http.HttpSession;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import tools.jackson.databind.JsonNode;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Controller
public class OrderController {

	public record ConfirmRequest(Map<Country, Integer> orders, String routeType, long masterVersion, String memo) {
	}

	public record StatusRequest(OrderStatus status, long version) {
	}

	public record StatusOption(String name, String label) {
		static StatusOption of(OrderStatus s) {
			return new StatusOption(s.name(), s.getLabel());
		}
	}

	public record OrderRow(Long id, String confirmedAt, int totalK, String routeLabel, int totalDays,
			String totalCostEok, String status, String statusLabel, String createdBy) {
	}

	public record OrderList(List<OrderRow> orders, Map<OrderStatus, Long> counts, int total,
			List<StatusOption> statuses) {
	}

	public record HistoryRow(String changedAt, String fromLabel, String toLabel, String changedBy) {
	}

	public record OrderDetail(Long id, String status, String statusLabel, List<StatusOption> next,
			String confirmedAt, String createdBy, String routeLabel, String memo, long version, JsonNode plan,
			List<HistoryRow> history) {
	}

	private static final DateTimeFormatter MINUTE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
	private static final DateTimeFormatter SECOND = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

	private final OrderService service;
	private final ObjectMapper json;

	public OrderController(OrderService service, ObjectMapper json) {
		this.service = service;
		this.json = json;
	}

	@GetMapping("/orders")
	public String listPage() {
		return "forward:/pages/orders.html";
	}

	@GetMapping("/orders/new")
	public String newOrderPage() {
		return "forward:/pages/order-new.html";
	}

	@GetMapping("/orders/{id}")
	public String detailPage(@PathVariable Long id) {
		return "forward:/pages/order-detail.html";
	}

	@GetMapping("/api/orders")
	@ResponseBody
	public OrderList list(@RequestParam(required = false) OrderStatus status) {
		List<OrderRow> rows = service.listOrders(status).stream().map(OrderController::toRow).toList();
		return new OrderList(rows, service.countByStatus(), service.listOrders(null).size(),
				Arrays.stream(OrderStatus.values()).map(StatusOption::of).toList());
	}

	@GetMapping("/api/orders/{id}")
	@ResponseBody
	public ResponseEntity<?> detail(@PathVariable Long id) {
		try {
			Order o = service.getOrder(id);
			List<HistoryRow> history = service.history(id).stream().map(OrderController::toHistoryRow).toList();
			return ResponseEntity.ok(new OrderDetail(o.getId(), o.getStatus().name(), o.getStatus().getLabel(),
					o.getStatus().next().stream().map(StatusOption::of).toList(), format(o.getConfirmedAt(), MINUTE),
					o.getCreatedBy(), o.getRouteLabel(), o.getMemo(), o.getVersion(),
					json.readTree(o.getPlanJson()), history));
		} catch (BusinessException e) {
			return ApiErrors.of(e);
		} catch (JacksonException e) {
			return ApiErrors.serverError("저장된 계획 데이터를 읽을 수 없습니다");
		}
	}

	@PostMapping("/api/orders/{id}/status")
	@ResponseBody
	public ResponseEntity<?> changeStatus(@PathVariable Long id, @RequestBody StatusRequest request,
			HttpSession session) {
		try {
			service.changeStatus(id, request.status(), request.version(),
					(String) session.getAttribute(LoginInterceptor.SESSION_USER));
			return ResponseEntity.ok(Map.of("message", "상태를 '" + request.status().getLabel() + "'(으)로 바꿨습니다"));
		} catch (BusinessException e) {
			return ApiErrors.of(e);
		}
	}

	@PostMapping("/api/orders")
	@ResponseBody
	public ResponseEntity<?> confirm(@RequestBody ConfirmRequest request, HttpSession session) {
		try {
			Order order = service.confirm(request.orders(), request.routeType(), request.masterVersion(),
					request.memo(), (String) session.getAttribute(LoginInterceptor.SESSION_USER));
			return ResponseEntity.ok(Map.of("id", order.getId()));
		} catch (BusinessException e) {
			return ApiErrors.of(e);
		}
	}

	private static OrderRow toRow(Order o) {
		return new OrderRow(o.getId(), format(o.getConfirmedAt(), MINUTE), o.getTotalK(), o.getRouteLabel(),
				o.getTotalDays(), o.getTotalCostEok(), o.getStatus().name(), o.getStatus().getLabel(),
				o.getCreatedBy());
	}

	private static HistoryRow toHistoryRow(OrderStatusHistory h) {
		return new HistoryRow(format(h.getChangedAt(), SECOND),
				h.getFromStatus() != null ? h.getFromStatus().getLabel() : null, h.getToStatus().getLabel(),
				h.getChangedBy());
	}

	private static String format(LocalDateTime t, DateTimeFormatter f) {
		return t.format(f);
	}
}
