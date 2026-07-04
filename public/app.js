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

function isSameMonth(date, referenceDate) {
	return (
		date.getMonth() === referenceDate.getMonth() &&
		date.getFullYear() === referenceDate.getFullYear()
	);
}

function getCurrentWeekRange(referenceDate) {
	const current = new Date(referenceDate);
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

function sortByDateDescending(transactionList) {
	return [...transactionList].sort((a, b) => new Date(b.date) - new Date(a.date));
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

async function loadTransactions() {
	try {
		transactions = await fetchTransactions();
		renderData();
	} catch (error) {
		console.error('Error fetching data:', error);
		alert('Tidak bisa terhubung ke Backend. Pastikan server berjalan di http://localhost:3000');
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

function renderData() {
	const now = new Date();
	const searchTerm = elements.searchInput.value;

	renderMonthLabel(now);
	renderSummaryCards(now);

	const filteredTransactions = sortByDateDescending(
		filterTransactions(transactions, { searchTerm, monthFilter: activeMonthFilter, now })
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

	try {
		await saveTransaction(payload, editId);
		alert(isEditMode ? 'Data berhasil diupdate!' : 'Transaksi berhasil disimpan!');
		resetFormToCreateMode();
		await loadTransactions();
	} catch (error) {
		console.error(error);
		alert('Gagal menyimpan data. Cek koneksi backend.');
	}
}

function editTransaction(transactionId) {
	const transaction = transactions.find((t) => t.id === transactionId);
	if (!transaction) return;

	elements.salesForm.scrollIntoView({ behavior: 'smooth' });
	setFormToEditMode(transaction);
}

async function deleteTransaction(transactionId) {
	const isConfirmed = confirm('Apakah Anda yakin ingin menghapus transaksi ini?');
	if (!isConfirmed) return;

	try {
		await deleteTransactionById(transactionId);
		await loadTransactions();
	} catch (error) {
		console.error(error);
		alert('Gagal menghapus data.');
	}
}

async function resetData() {
	const isConfirmed = confirm('PERINGATAN: Semua data akan dihapus dari database! Lanjutkan?');
	if (!isConfirmed) return;

	try {
		await deleteAllTransactions();
		alert('Data dihapus (Pastikan LocalStorage juga dibersihkan jika ada).');
		await loadTransactions();
	} catch (error) {
		console.error('Gagal menghapus semua data:', error);
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

async function captureAsPNG(event) {
	const button = event.target.closest('button');
	const originalButtonHtml = button.innerHTML;

	const setButtonLoading = (isLoading) => {
		button.disabled = isLoading;
		button.innerHTML = isLoading
			? '<i class="fas fa-spinner fa-spin mr-1"></i> Processing...'
			: originalButtonHtml;
	};

	try {
		setButtonLoading(true);

		const canvas = await html2canvas(elements.printableArea, {
			allowTaint: true,
			useCORS: true,
			scale: 2,
			backgroundColor: '#ffffff'
		});

		canvas.toBlob((blob) => {
			const blobUrl = URL.createObjectURL(blob);
			const todayLabel = new Date().toLocaleDateString('id-ID');
			triggerDownload(blobUrl, `Hasil Y Team Gorengan minggu ini - ${todayLabel}.png`);
			URL.revokeObjectURL(blobUrl);
			setButtonLoading(false);
		});
	} catch (error) {
		console.error('Error capturing PNG:', error);
		alert('Gagal menangkap gambar. Silakan coba lagi.');
		setButtonLoading(false);
	}
}

function initializeApp() {
	elements.transactionDate.value = new Date().toISOString().split('T')[0];
	elements.searchInput.addEventListener('keyup', renderData);
	elements.salesForm.addEventListener('submit', handleFormSubmit);

	loadTransactions();
}

window.addEventListener('load', initializeApp);