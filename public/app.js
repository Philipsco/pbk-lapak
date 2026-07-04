let transactions = [];
let chartInstance = null;
let activeMonthFilter = 'all';
const APP_CONFIG = {
	apiBaseUrl: window.location.origin + '/api',
	ppnRate: 0.10,
	monthNames: [
		'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
		'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
	]
};
let sortState = { key: 'date', direction: 'desc' };

const elements = {
	tableBody: document.getElementById('transactionTableBody'),
	searchInput: document.getElementById('searchInput'),
	emptyState: document.getElementById('emptyState'),
	currentMonthLabel: document.getElementById('currentMonthLabel'),
	weekPpnDisplay: document.getElementById('weekPpnDisplay'),
	weekProfitDisplay: document.getElementById('weekProfitDisplay'),
	monthModal: document.getElementById('monthModal'),
	monthSales: document.getElementById('monthSales'),
	monthSales2: document.getElementById('monthSales2'),
	monthPpn: document.getElementById('monthPpn'),
	monthPpn2: document.getElementById('monthPpn2'),
	monthProfit: document.getElementById('monthProfit'),
	allTimeProfitDisplay: document.getElementById('allTimeProfitDisplay'),
	salesForm: document.getElementById('salesForm'),
	formBtn: document.getElementById('formBtn'),
	transactionDate: document.getElementById('transactionDate'),
	itemName: document.getElementById('itemName'),
	qty: document.getElementById('qty'),
	qtyTersisa: document.getElementById('qty_tersisa'),
	buyPrice: document.getElementById('buyPrice'),
	sellPrice: document.getElementById('sellPrice'),
	isPpnApplicable: document.getElementById('isPpnApplicable'),
	profitChartCanvas: document.getElementById('profitChart'),
	printableArea: document.getElementById('printableArea'),
	topSellingList: document.getElementById('topSellingList'),
	leastSellingList: document.getElementById('leastSellingList'),
	loadingState: document.getElementById('loadingState'),
	itemNameSuggestions: document.getElementById('itemNameSuggestions'),
	toastContainer: document.getElementById('toastContainer'),
	confirmModalOverlay: document.getElementById('confirmModalOverlay'),
	confirmModalMessage: document.getElementById('confirmModalMessage'),
	confirmModalCancelBtn: document.getElementById('confirmModalCancelBtn'),
	confirmModalConfirmBtn: document.getElementById('confirmModalConfirmBtn'),
	monthFilterButtons: document.querySelectorAll('.active-month')
};

function formatCurrency(amount) {
	return new Intl.NumberFormat('id-ID', {
		style: 'currency',
		currency: 'IDR',
		minimumFractionDigits: 0
	}).format(amount);
}

function triggerDownload(href, filename) {
	const link = document.createElement('a');
	link.href = href;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

const TOAST_STYLE_BY_TYPE = {
	success: { bg: 'bg-green-600', icon: 'fa-circle-check' },
	error: { bg: 'bg-red-600', icon: 'fa-circle-exclamation' },
	info: { bg: 'bg-indigo-600', icon: 'fa-circle-info' }
};

function showToast(message, type = 'info', durationMs = 3500) {
	const style = TOAST_STYLE_BY_TYPE[type] || TOAST_STYLE_BY_TYPE.info;

	const toast = document.createElement('div');
	toast.className = `${style.bg} text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 opacity-0 translate-x-2 transition-all duration-300`;
	toast.innerHTML = `<i class="fas ${style.icon}"></i><span>${message}</span>`;
	elements.toastContainer.appendChild(toast);

	requestAnimationFrame(() => {
		toast.classList.remove('opacity-0', 'translate-x-2');
	});

	setTimeout(() => {
		toast.classList.add('opacity-0', 'translate-x-2');
		setTimeout(() => toast.remove(), 300);
	}, durationMs);
}

function showConfirmDialog(message) {
	return new Promise((resolve) => {
		elements.confirmModalMessage.textContent = message;
		elements.confirmModalOverlay.classList.remove('hidden');

		const handleResult = (result) => {
			elements.confirmModalOverlay.classList.add('hidden');
			elements.confirmModalConfirmBtn.removeEventListener('click', onConfirm);
			elements.confirmModalCancelBtn.removeEventListener('click', onCancel);
			resolve(result);
		};

		const onConfirm = () => handleResult(true);
		const onCancel = () => handleResult(false);

		elements.confirmModalConfirmBtn.addEventListener('click', onConfirm);
		elements.confirmModalCancelBtn.addEventListener('click', onCancel);
	});
}

function calculateTransactionMetrics(transaction) {
	const qtySold = transaction.qty - (transaction.qty_tersisa || 0);
	const totalModal = parseFloat(transaction.buy_price);
	const totalPenjualan = qtySold * parseFloat(transaction.sell_price);
	const isPpnApplicable = transaction.is_ppn_applicable === 1;
	const totalPpn = isPpnApplicable ? totalPenjualan * APP_CONFIG.ppnRate : 0;
	const netProfit = (totalPenjualan - totalModal) - totalPpn;

	return { qtySold, totalModal, totalPenjualan, isPpnApplicable, totalPpn, netProfit };
}

function sumTransactionMetrics(transactionList, metricKey) {
	return transactionList.reduce(
		(total, transaction) => total + calculateTransactionMetrics(transaction)[metricKey],
		0
	);
}

function buildItemPerformanceList(transactionList) {
	const itemPerformanceMap = new Map();

	transactionList.forEach((transaction) => {
		const metrics = calculateTransactionMetrics(transaction);
		const itemKey = transaction.item_name || 'Tanpa Nama';

		if (!itemPerformanceMap.has(itemKey)) {
			itemPerformanceMap.set(itemKey, {
				itemName: itemKey,
				totalQtySold: 0,
				totalQtyUnsold: 0,
				totalRevenue: 0,
				totalProfit: 0
			});
		}

		const performance = itemPerformanceMap.get(itemKey);
		performance.totalQtySold += metrics.qtySold;
		performance.totalQtyUnsold += (transaction.qty_tersisa || 0);
		performance.totalRevenue += metrics.totalPenjualan;
		performance.totalProfit += metrics.netProfit;
	});

	return [...itemPerformanceMap.values()];
}

function getTopSellingItems(itemPerformanceList, limit = 5) {
	return [...itemPerformanceList]
		.filter((item) => item.totalQtySold > 0)
		.sort((a, b) => b.totalQtySold - a.totalQtySold)
		.slice(0, limit);
}

function getLeastSellingItems(itemPerformanceList, limit = 5) {
	return [...itemPerformanceList]
		.filter((item) => item.totalQtyUnsold > 0)
		.sort((a, b) => b.totalQtyUnsold - a.totalQtyUnsold)
		.slice(0, limit);
}

function isSameMonth(date, referenceDate) {
	return (
		date.getMonth() === referenceDate.getMonth() &&
		date.getFullYear() === referenceDate.getFullYear()
	);
}

function getCurrentWeekRange(referenceDate) {
	const current = new Date(referenceDate); // clone agar tidak mengubah tanggal aslinya
	const dayOfWeek = current.getDay();
	const diffToMonday = current.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);

	const monday = new Date(current.setDate(diffToMonday));
	monday.setHours(0, 0, 0, 0);

	const sunday = new Date(monday);
	sunday.setDate(sunday.getDate() + 6);
	sunday.setHours(23, 59, 59, 999);

	return { start: monday, end: sunday };
}

function isWithinRange(date, range) {
	return date >= range.start && date <= range.end;
}

function matchesMonthFilter(transactionDate, filterType, now) {
	switch (filterType) {
		case 'current':
			return isSameMonth(transactionDate, now);
		case 'week':
			return isWithinRange(transactionDate, getCurrentWeekRange(now));
		case 'all':
		default:
			return true;
	}
}

function matchesSearchTerm(transaction, searchTerm) {
	if (!searchTerm) return true;

	const transactionDate = new Date(transaction.date);
	const formattedDate = transactionDate.toLocaleDateString('id-ID', {
		day: '2-digit', month: '2-digit', year: 'numeric'
	});
	const itemName = transaction.item_name ? transaction.item_name.toLowerCase() : '';

	return `${itemName} ${formattedDate}`.includes(searchTerm.toLowerCase());
}

function filterTransactions(transactionList, { searchTerm, monthFilter, now }) {
	return transactionList.filter((transaction) => {
		const transactionDate = new Date(transaction.date);
		return (
			matchesSearchTerm(transaction, searchTerm) &&
			matchesMonthFilter(transactionDate, monthFilter, now)
		);
	});
}

function getSortValue(transaction, sortKey) {
	if (sortKey === 'date') return new Date(transaction.date).getTime();
	if (sortKey === 'qty') return transaction.qty;
	if (sortKey === 'qtyTersisa') return transaction.qty_tersisa || 0;
	return calculateTransactionMetrics(transaction)[sortKey] ?? 0;
}

function sortTransactions(transactionList, { key, direction }) {
	const sorted = [...transactionList].sort(
		(a, b) => getSortValue(a, key) - getSortValue(b, key)
	);
	return direction === 'desc' ? sorted.reverse() : sorted;
}

async function apiRequest(endpoint, options = {}) {
	const response = await fetch(`${APP_CONFIG.apiBaseUrl}${endpoint}`, {
		headers: { 'Content-Type': 'application/json' },
		...options
	});

	if (!response.ok) {
		throw new Error(`Request gagal: ${options.method || 'GET'} ${endpoint}`);
	}

	const contentType = response.headers.get('content-type') || '';
	return contentType.includes('application/json') ? response.json() : null;
}

function fetchTransactions() {
	return apiRequest('/transactions');
}

function saveTransaction(payload, transactionId) {
	const endpoint = transactionId ? `/transactions/${transactionId}` : '/transactions';
	const method = transactionId ? 'PUT' : 'POST';
	return apiRequest(endpoint, { method, body: JSON.stringify(payload) });
}

function deleteTransactionById(transactionId) {
	return apiRequest(`/transactions/${transactionId}`, { method: 'DELETE' });
}

function deleteAllTransactions() {
	return apiRequest('/transactions', { method: 'DELETE' });
}

function setLoadingState(isLoading) {
	elements.loadingState.classList.toggle('hidden', !isLoading);
	if (isLoading) {
		elements.emptyState.classList.add('hidden');
		elements.tableBody.innerHTML = '';
	}
}

async function loadTransactions() {
	setLoadingState(true);
	try {
		transactions = await fetchTransactions();
		renderData();
	} catch (error) {
		console.error('Error fetching data:', error);
		showToast('Tidak bisa terhubung ke Backend. Pastikan server berjalan di http://localhost:3000', 'error');
	} finally {
		setLoadingState(false);
	}
}

function renderMonthLabel(now) {
	elements.currentMonthLabel.innerText = `${now.getFullYear()} - ${APP_CONFIG.monthNames[now.getMonth()]}`;
}

function renderSummaryCards(now) {
	const currentMonthTransactions = transactions.filter((t) => isSameMonth(new Date(t.date), now));
	const currentWeekTransactions = transactions.filter((t) =>
		isWithinRange(new Date(t.date), getCurrentWeekRange(now))
	);

	const monthSalesTotal = sumTransactionMetrics(currentMonthTransactions, 'totalPenjualan');
	const monthModalTotal = sumTransactionMetrics(currentMonthTransactions, 'totalModal');
	const monthPpnTotal = sumTransactionMetrics(currentMonthTransactions, 'totalPpn');
	const monthProfitTotal = monthSalesTotal - monthModalTotal - monthPpnTotal;
	const transferToPbkTotal = monthSalesTotal - monthPpnTotal;

	const weekPpnTotal = sumTransactionMetrics(currentWeekTransactions, 'totalPpn');
	const weekProfitTotal = sumTransactionMetrics(currentWeekTransactions, 'netProfit');

	const allTimeProfitTotal = sumTransactionMetrics(transactions, 'netProfit');

	elements.weekPpnDisplay.innerText = formatCurrency(weekPpnTotal);
	elements.weekProfitDisplay.innerText = formatCurrency(weekProfitTotal);
	elements.monthModal.innerText = formatCurrency(monthModalTotal);
	elements.monthSales.innerText = formatCurrency(monthSalesTotal);
	elements.monthSales2.innerText = formatCurrency(transferToPbkTotal);
	elements.monthPpn.innerText = formatCurrency(monthPpnTotal);
	elements.monthPpn2.innerText = formatCurrency(monthPpnTotal);
	elements.monthProfit.innerText = formatCurrency(monthProfitTotal);
	elements.allTimeProfitDisplay.innerText = formatCurrency(allTimeProfitTotal);
}

function renderTransactionRow(transaction) {
	const metrics = calculateTransactionMetrics(transaction);
	const transactionDate = new Date(transaction.date);

	const ppnLabel = metrics.isPpnApplicable ? '10%' : '0%';
	const ppnColorClass = metrics.isPpnApplicable ? 'text-yellow-600' : 'text-gray-400';
	const profitColorClass = metrics.netProfit >= 0 ? 'text-green-600 bg-green-90' : 'text-red-500 bg-red-90';
	const sisaColorClass = transaction.qty_tersisa ? 'text-yellow-500' : 'text-gray-500';

	return `
		<tr class="hover:bg-gray-50 border-b border-gray-100 transition-colors">
			<td class="px-5 py-2 text-sm text-gray-600 whitespace-nowrap">${transactionDate.toLocaleDateString('id-ID')}</td>
			<td class="px-5 py-2 text-sm font-medium text-gray-900 truncate max-w-[100px]" title="${transaction.item_name}">${transaction.item_name}</td>
			<td class="px-5 py-2 text-sm text-gray-500 font-bold">${transaction.qty} pcs</td>
			<td class="px-5 py-2 text-sm text-gray-500 font-bold ${sisaColorClass}">${transaction.qty_tersisa || 0} pcs</td>
			<td class="px-5 py-2 text-sm text-red-600 font-medium no-print">${formatCurrency(metrics.totalModal)}</td>
			<td class="px-5 py-2 text-sm text-green-600 bg-green-50 font-medium">${formatCurrency(metrics.totalPenjualan)}</td>
			<td class="px-5 py-2 text-sm text-gray-500 italic ${ppnColorClass}">${ppnLabel}</td>
			<td class="px-5 py-2 text-sm font-bold no-print ${profitColorClass}">${formatCurrency(metrics.netProfit)}</td>
			<td class="px-5 py-2 text-sm no-print">
				<div class="flex space-x-2 justify-end">
					<button onclick="editTransaction(${transaction.id})" class="text-blue-400 hover:text-blue-600 transition"><i class="fas fa-edit"></i></button>
					<button onclick="deleteTransaction(${transaction.id})" class="text-red-400 hover:text-red-600 transition"><i class="fas fa-trash-alt"></i></button>
				</div>
			</td>
		</tr>
	`;
}

function renderTransactionTable(transactionList) {
	const hasData = transactionList.length > 0;
	elements.emptyState.classList.toggle('hidden', hasData);
	elements.tableBody.innerHTML = hasData ? transactionList.map(renderTransactionRow).join('') : '';
}

function buildDailyProfitMap(transactionList) {
	const dailyProfitMap = new Map();

	transactionList.forEach((transaction) => {
		const dateKey = new Date(transaction.date).toISOString().split('T')[0];
		const { netProfit } = calculateTransactionMetrics(transaction);
		dailyProfitMap.set(dateKey, (dailyProfitMap.get(dateKey) || 0) + netProfit);
	});

	return dailyProfitMap;
}

function renderChart(transactionList) {
	const dailyProfitMap = buildDailyProfitMap(transactionList);
	const sortedDateKeys = [...dailyProfitMap.keys()].sort((a, b) => new Date(a) - new Date(b));

	const labels = sortedDateKeys.map((dateKey) => {
		const date = new Date(dateKey);
		return `${date.getDate()}/${date.getMonth() + 1}`;
	});
	const dataPoints = sortedDateKeys.map((dateKey) => dailyProfitMap.get(dateKey));

	if (chartInstance) {
		chartInstance.destroy();
	}

	chartInstance = new Chart(elements.profitChartCanvas.getContext('2d'), {
		type: 'line',
		data: {
			labels,
			datasets: [{
				label: 'Total Profit Bersih (Rp)',
				data: dataPoints,
				borderColor: '#4f46e5',
				backgroundColor: 'rgba(79, 70, 229, 0.1)',
				borderWidth: 2,
				tension: 0.3,
				fill: true,
				pointBackgroundColor: '#fff',
				pointBorderColor: '#4f46e5',
				pointBorderWidth: 2,
				pointRadius: 6
			}]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: true },
				tooltip: {
					callbacks: {
						label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
					}
				}
			},
			scales: {
				y: {
					beginAtZero: true,
					ticks: {
						color: '#6b7280',
						callback: (value) => `Rp ${value.toLocaleString()}`
					}
				},
				x: { ticks: { color: '#6b7280' } }
			}
		}
	});
}

function renderRankingList(container, items, { valueKey, valueSuffix, emptyMessage }) {
	if (items.length === 0) {
		container.innerHTML = `<li class="text-xs text-gray-400 italic py-2">${emptyMessage}</li>`;
		return;
	}

	container.innerHTML = items
		.map((item, index) => `
			<li class="flex justify-between items-center py-2">
				<span class="text-sm text-gray-700 truncate max-w-[65%]" title="${item.itemName}">
					<span class="text-gray-400 font-mono mr-2">#${index + 1}</span>${item.itemName}
				</span>
				<span class="text-sm font-bold text-gray-600 whitespace-nowrap">${item[valueKey]} ${valueSuffix}</span>
			</li>
		`)
		.join('');
}

function renderItemAnalytics() {
	const itemPerformanceList = buildItemPerformanceList(transactions);

	renderRankingList(elements.topSellingList, getTopSellingItems(itemPerformanceList), {
		valueKey: 'totalQtySold',
		valueSuffix: 'pcs terjual',
		emptyMessage: 'Belum ada barang terjual.'
	});

	renderRankingList(elements.leastSellingList, getLeastSellingItems(itemPerformanceList), {
		valueKey: 'totalQtyUnsold',
		valueSuffix: 'pcs tersisa',
		emptyMessage: 'Tidak ada barang tersisa. \u{1F389}'
	});
}

function renderItemNameSuggestions() {
	const uniqueItemNames = [...new Set(transactions.map((t) => t.item_name).filter(Boolean))]
		.sort((a, b) => a.localeCompare(b));

	elements.itemNameSuggestions.innerHTML = uniqueItemNames
		.map((name) => `<option value="${name}"></option>`)
		.join('');
}

function renderSortIndicators() {
	document.querySelectorAll('[data-sort-icon]').forEach((icon) => {
		const sortKey = icon.dataset.sortIcon;
		icon.className = 'fas ml-1 text-gray-400 fa-sort';

		if (sortKey === sortState.key) {
			icon.classList.remove('fa-sort', 'text-gray-400');
			icon.classList.add(sortState.direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down', 'text-indigo-600');
		}
	});
}

function handleSortClick(sortKey) {
	if (sortState.key === sortKey) {
		sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
	} else {
		sortState = { key: sortKey, direction: 'desc' };
	}
	renderData();
}

function renderData() {
	const now = new Date();
	const searchTerm = elements.searchInput.value;

	renderMonthLabel(now);
	renderSummaryCards(now);
	renderItemAnalytics();
	renderItemNameSuggestions();
	renderSortIndicators();

	const filteredTransactions = sortTransactions(
		filterTransactions(transactions, { searchTerm, monthFilter: activeMonthFilter, now }),
		sortState
	);

	renderTransactionTable(filteredTransactions);
	renderChart(transactions);
}

function getFormPayload() {
	return {
		date: elements.transactionDate.value,
		itemName: elements.itemName.value.trim(),
		qty: parseInt(elements.qty.value, 10),
		qtyTersisa: parseInt(elements.qtyTersisa.value, 10) || 0,
		buyPrice: parseFloat(elements.buyPrice.value),
		sellPrice: parseFloat(elements.sellPrice.value),
		isPpnApplicable: elements.isPpnApplicable.checked ? 1 : 0
	};
}

function resetFormToCreateMode() {
	elements.salesForm.reset();
	elements.transactionDate.value = '';
	delete elements.salesForm.dataset.editId;

	elements.formBtn.innerText = 'Tambah Transaksi';
	elements.formBtn.classList.replace('bg-orange-500', 'bg-indigo-600');
}

function setFormToEditMode(transaction) {
	elements.transactionDate.value = transaction.date;
	elements.itemName.value = transaction.item_name;
	elements.qty.value = transaction.qty;
	elements.qtyTersisa.value = transaction.qty_tersisa || 0;
	elements.buyPrice.value = transaction.buy_price;
	elements.sellPrice.value = transaction.sell_price;
	elements.isPpnApplicable.checked = transaction.is_ppn_applicable === 1;
	elements.salesForm.dataset.editId = transaction.id;

	elements.formBtn.innerText = 'Update Transaksi';
	elements.formBtn.classList.replace('bg-indigo-600', 'bg-orange-500');
}

async function handleFormSubmit(event) {
	event.preventDefault();

	const editId = elements.salesForm.dataset.editId;
	const isEditMode = Boolean(editId);
	const payload = getFormPayload();

	const originalButtonText = elements.formBtn.innerText;
	elements.formBtn.disabled = true;
	elements.formBtn.innerText = 'Menyimpan...';

	try {
		await saveTransaction(payload, editId);
		showToast(isEditMode ? 'Data berhasil diupdate!' : 'Transaksi berhasil disimpan!', 'success');
		resetFormToCreateMode();
		await loadTransactions();
	} catch (error) {
		console.error(error);
		showToast('Gagal menyimpan data. Cek koneksi backend.', 'error');
	} finally {
		elements.formBtn.disabled = false;
		if (elements.formBtn.innerText === 'Menyimpan...') {
			elements.formBtn.innerText = originalButtonText;
		}
	}
}

function editTransaction(transactionId) {
	const transaction = transactions.find((t) => t.id === transactionId);
	if (!transaction) return;

	elements.salesForm.scrollIntoView({ behavior: 'smooth' });
	setFormToEditMode(transaction);
}

async function deleteTransaction(transactionId) {
	const isConfirmed = await showConfirmDialog('Apakah Anda yakin ingin menghapus transaksi ini?');
	if (!isConfirmed) return;

	try {
		await deleteTransactionById(transactionId);
		showToast('Transaksi berhasil dihapus.', 'success');
		await loadTransactions();
	} catch (error) {
		console.error(error);
		showToast('Gagal menghapus data.', 'error');
	}
}

async function resetData() {
	const isConfirmed = await showConfirmDialog('PERINGATAN: Semua data akan dihapus dari database! Lanjutkan?');
	if (!isConfirmed) return;

	try {
		await deleteAllTransactions();
		showToast('Semua data berhasil dihapus.', 'success');
		await loadTransactions();
	} catch (error) {
		console.error('Gagal menghapus semua data:', error);
		showToast('Gagal menghapus semua data.', 'error');
	}
}

const FILTER_BUTTON_INDEX = { current: 0, week: 1 };

function filterMonth(filterType) {
	activeMonthFilter = filterType;

	elements.monthFilterButtons.forEach((button) => {
		button.classList.remove('bg-indigo-100', 'text-indigo-700', 'border-indigo-200');
	});

	const activeButtonIndex = FILTER_BUTTON_INDEX[filterType];
	if (activeButtonIndex !== undefined) {
		elements.monthFilterButtons[activeButtonIndex].classList.add(
			'bg-indigo-100', 'text-indigo-700', 'border-indigo-200'
		);
	}

	renderData();
}

function buildCsvRow(transaction) {
	const metrics = calculateTransactionMetrics(transaction);
	const transactionDate = new Date(transaction.date);

	return [
		transactionDate.toLocaleDateString(),
		transaction.item_name,
		transaction.qty,
		transaction.qty_tersisa || 0,
		transaction.buy_price,
		transaction.sell_price,
		metrics.totalModal,
		metrics.totalPpn,
		metrics.netProfit
	].join(',');
}

function exportToExcel() {
	const csvHeader = 'Tanggal,Nama Barang,Jumlah,Jumlah Tersisa,Harga Beli,Harga Jual,Modal,Pajak (PPN),Profit Bersih';
	const csvRows = [...transactions].reverse().map(buildCsvRow);
	const csvContent = `data:text/csv;charset=utf-8,${csvHeader}\r\n${csvRows.join('\r\n')}`;

	triggerDownload(encodeURI(csvContent), 'Laporan_Penjualan.csv');
}

async function withButtonLoadingState(event, loadingLabel, action) {
	const button = event.target.closest('button');
	const originalButtonHtml = button.innerHTML;

	button.disabled = true;
	button.innerHTML = `<i class="fas fa-spinner fa-spin mr-1"></i> ${loadingLabel}`;

	try {
		await action();
	} finally {
		button.disabled = false;
		button.innerHTML = originalButtonHtml;
	}
}

function captureTableAsCanvas() {
	return html2canvas(elements.printableArea, {
		allowTaint: true,
		useCORS: true,
		scale: 2,
		backgroundColor: '#ffffff'
	});
}

async function captureAsPNG(event) {
	await withButtonLoadingState(event, 'Processing...', async () => {
		try {
			const canvas = await captureTableAsCanvas();

			await new Promise((resolve) => {
				canvas.toBlob((blob) => {
					const blobUrl = URL.createObjectURL(blob);
					const todayLabel = new Date().toLocaleDateString('id-ID');
					triggerDownload(blobUrl, `Hasil Y Team Gorengan minggu ini - ${todayLabel}.png`);
					URL.revokeObjectURL(blobUrl);
					resolve();
				});
			});
		} catch (error) {
			console.error('Error capturing PNG:', error);
			showToast('Gagal menangkap gambar. Silakan coba lagi.', 'error');
		}
	});
}

async function exportToPDF(event) {
	await withButtonLoadingState(event, 'Membuat PDF...', async () => {
		try {
			const canvas = await captureTableAsCanvas();
			const imageData = canvas.toDataURL('image/png');

			const { jsPDF } = window.jspdf;
			const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

			const pageWidth = pdf.internal.pageSize.getWidth();
			const imageProps = pdf.getImageProperties(imageData);
			const imageHeight = (imageProps.height * pageWidth) / imageProps.width;

			pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, imageHeight);

			const todayLabel = new Date().toLocaleDateString('id-ID').replace(/\//g, '-');
			pdf.save(`Laporan_Penjualan_${todayLabel}.pdf`);
			showToast('PDF berhasil dibuat.', 'success');
		} catch (error) {
			console.error('Error membuat PDF:', error);
			showToast('Gagal membuat PDF. Silakan coba lagi.', 'error');
		}
	});
}

function initializeApp() {
	elements.transactionDate.value = new Date().toISOString().split('T')[0];
	elements.searchInput.addEventListener('keyup', renderData);
	elements.salesForm.addEventListener('submit', handleFormSubmit);

	document.querySelectorAll('[data-sort-key]').forEach((header) => {
		header.addEventListener('click', () => handleSortClick(header.dataset.sortKey));
	});

	loadTransactions();
}

window.addEventListener('load', initializeApp);