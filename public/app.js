let transactions = [];
let chartInstance = null;
const API_URL = window.location.origin + '/api';
let filterMonthBtnActive = 'all';

const formatRupiah = (number) => {
	return new Intl.NumberFormat('id-ID', {
		style: 'currency',
		currency: 'IDR',
		minimumFractionDigits: 0
	}).format(number);
};

async function fetchData() {
	try {
		const response = await fetch(`${API_URL}/transactions`);
		if (!response.ok) throw new Error('Gagal mengambil data');
		transactions = await response.json();
		renderData();
	} catch (error) {
		console.error("Error fetching data:", error);
		alert("Tidak bisa terhubung ke Backend. Pastikan server berjalan di http://localhost:3000");
	}
}

function renderData() {
	const tableBody = document.getElementById('transactionTableBody');
	const searchInput = document.getElementById('searchInput').value.toLowerCase();
	const now = new Date();

	let weekPpn = 0;
	let weekProfit = 0;
	let monthModal = 0;
	let monthSales = 0;
	let monthPpn = 0;

	// Setup UI Month Label & Filter Logic
	const currentMonthIndex = now.getMonth();
	const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
	document.getElementById('currentMonthLabel').innerText = `${now.getFullYear()} - ${months[now.getMonth()]}`;

	// Filter Logic
	let filteredTransactions = transactions.filter(t => {
		const d = new Date(t.date);
		const dateStr = t.item_name ? t.item_name.toLowerCase() : '';

		const matchSearch = dateStr.includes(searchInput);
		const matchMonth = filterMonthBtnActive === 'all' || (d.getMonth() === currentMonthIndex && filterMonthBtnActive === 'current') || (filterMonthBtnActive === 'week' && d.getTime() >= now.getTime() - (7 * 24 * 60 * 60 * 1000));
		return matchSearch && matchMonth;
	});

	// Sort: Terbaru di atas
	filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

	if (filteredTransactions.length === 0) {
		tableBody.innerHTML = '';
		document.getElementById('emptyState').classList.remove('hidden');
	} else {
		document.getElementById('emptyState').classList.add('hidden');
		tableBody.innerHTML = '';
	}

	filteredTransactions.forEach(t => {
		const d = new Date(t.date);

		// Kalkulasi
		const totalModal = parseFloat(t.buy_price);
		const totalJual = parseInt(t.qty) * parseFloat(t.sell_price);
		const isPpn = t.is_ppn_applicable === 1;
		const ppnRate = isPpn ? 0.10 : 0;
		const ppn = totalJual * ppnRate;
		const profitKotorPerItem = (totalJual - totalModal) - ppn;

		// Kumpulkan Data Dashboard
		if (d.getMonth() === currentMonthIndex) {
			monthModal += totalModal;
			monthSales += totalJual;
			monthPpn += ppn;
		}

		const diffTime = Math.abs(now - d);
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays <= 7) {
			weekProfit += profitKotorPerItem;
			weekPpn += ppn;
		}

		if (d.getDate() === now.getDate() && d.getMonth() === currentMonthIndex && d.getFullYear() === now.getFullYear()) {
			weekPpn += ppn;
			weekProfit += profitKotorPerItem;
		}

		const row = `
                    <tr class="hover:bg-gray-50 border-b border-gray-100 transition-colors">
                        <td class="px-5 py-2 text-sm text-gray-600 whitespace-nowrap">${d.toLocaleDateString('id-ID')}</td>
                        <td class="px-5 py-2 text-sm font-medium text-gray-900 truncate max-w-[100px]" title="${t.item_name}">${t.item_name}</td>
                        <td class="px-5 py-2 text-sm text-gray-500 font-bold">${t.qty} pcs</td>
												<td class="px-5 py-2 text-sm text-red-600 font-medium no-print">${formatRupiah(totalModal)}</td>
												<td class="px-5 py-2 text-sm text-green-600 bg-green-50 font-medium">${formatRupiah(totalJual)}</td>
                        <td class="px-5 py-2 text-sm text-gray-500 italic ${isPpn ? 'text-yellow-600' : 'text-gray-400'}">${isPpn ? '10%' : '0%'}</td>
                        <td class="px-5 py-2 text-sm font-bold no-print ${profitKotorPerItem >= 0 ? 'text-green-600 bg-green-90' : 'text-red-500 bg-red-90'}">${formatRupiah(profitKotorPerItem)}</td>
                        <td class="px-5 py-2 text-sm no-print">
                            <div class="flex space-x-2 justify-end">
                                <button onclick="editTransaction(${t.id})" class="text-blue-400 hover:text-blue-600 transition"><i class="fas fa-edit"></i></button>
                                <button onclick="deleteTransaction(${t.id})" class="text-red-400 hover:text-red-600 transition"><i class="fas fa-trash-alt"></i></button>
                            </div>
                        </td>
                    </tr>
                `;
		tableBody.innerHTML += row;
	});

	// Update Dashboard Elements
	document.getElementById('weekPpnDisplay').innerText = formatRupiah(weekPpn);
	document.getElementById('weekProfitDisplay').innerText = formatRupiah(weekProfit);
	document.getElementById('monthModal').innerText = formatRupiah(monthModal);
	document.getElementById('monthSales').innerText = formatRupiah(monthSales);
	const pembayaranKePbk = monthSales - monthPpn;
	document.getElementById('monthSales2').innerText = formatRupiah(pembayaranKePbk);
	document.getElementById('monthPpn').innerText = formatRupiah(monthPpn);
	document.getElementById('monthPpn2').innerText = formatRupiah(monthPpn);
	const profitBulanIni = monthSales - monthModal - monthPpn;
	document.getElementById('monthProfit').innerText = formatRupiah(profitBulanIni);

	updateChart();
}

async function handleFormSubmit(e) {
	e.preventDefault();

	const idAttr = document.getElementById('salesForm').dataset.editId;
	const isEdit = !!idAttr;
	const dateVal = document.getElementById('transactionDate').value;
	const itemName = document.getElementById('itemName').value.trim();
	const qty = parseInt(document.getElementById('qty').value);
	const buyPrice = parseFloat(document.getElementById('buyPrice').value);
	const sellPrice = parseFloat(document.getElementById('sellPrice').value);
	const isPpnApplicable = document.getElementById('isPpnApplicable').checked;

	const payload = {
		date: dateVal,
		itemName: itemName,
		qty: qty,
		buyPrice: buyPrice,
		sellPrice: sellPrice,
		isPpnApplicable: isPpnApplicable ? 1 : 0
	};

	try {
		const endpoint = isEdit ? `/transactions/${idAttr}` : '/transactions';
		const method = isEdit ? 'PUT' : 'POST';

		const response = await fetch(`${API_URL}${endpoint}`, {
			method: method,
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) throw new Error('Gagal menyimpan data');

		// Reset Form UI
		document.getElementById('salesForm').reset();
		document.getElementById('transactionDate').value = '';

		alert(isEdit ? "Data berhasil diupdate!" : "Transaksi berhasil disimpan!");
		fetchData();
		if (isEdit) {
			delete document.getElementById('salesForm').dataset.editId;
			const btn = document.getElementById('formBtn');
			btn.innerText = "Tambah Transaksi";
			btn.classList.replace('bg-orange-500', 'bg-indigo-600');
		}

	} catch (error) {
		console.error(error);
		alert("Gagal menyimpan data. Cek koneksi backend.");
	}
}

async function deleteTransaction(id) {
	if (confirm("Apakah Anda yakin ingin menghapus transaksi ini?")) {
		try {
			await fetch(`${API_URL}/transactions/${id}`, {
				method: 'DELETE'
			});
			fetchData();
		} catch (error) {
			alert("Gagal menghapus data.");
		}
	}
}

async function editTransaction(id) {
	const item = transactions.find(t => t.id === id);
	if (!item) return;

	document.getElementById('salesForm').scrollIntoView({
		behavior: 'smooth'
	});

	document.getElementById('transactionDate').value = item.date;
	document.getElementById('itemName').value = item.item_name;
	document.getElementById('qty').value = item.qty;
	document.getElementById('buyPrice').value = item.buy_price;
	document.getElementById('sellPrice').value = item.sell_price;
	document.getElementById('isPpnApplicable').checked = item.is_ppn_applicable === 1;

	const btn = document.getElementById('formBtn');
	btn.innerText = "Update Transaksi";
	btn.classList.replace('bg-indigo-600', 'bg-orange-500');

	document.getElementById('salesForm').dataset.editId = id;
}

async function resetData() {
	if (confirm("PERINGATAN: Semua data akan dihapus dari database! Lanjutkan?")) {
		try {
			await fetch(`${API_URL}/transactions`, {
				method: 'DELETE'
			});
			alert("Data dihapus (Pastikan LocalStorage juga dibersihkan jika ada).");
		} catch (e) {
			console.log("Clear all not implemented in simple API yet, use Reset Pabrik button logic manually or add DELETE /clear route.");
		}
	}
}

// Filter Bulan Logic
function filterMonth(type) {
	filterMonthBtnActive = type;
	const btns = document.querySelectorAll('.active-month');
	btns.forEach(b => b.classList.remove('bg-indigo-100', 'text-indigo-700'));
	btns.forEach(b => b.classList.remove('border-indigo-200'));

	if (type === 'current') {
		btns[0].classList.add('bg-indigo-100', 'text-indigo-700', 'border-indigo-200');
	} else if (type === 'week') {
		btns[1].classList.add('bg-indigo-100', 'text-indigo-700', 'border-indigo-200');
	}
	renderData();
}

// Search Logic
document.getElementById('searchInput').addEventListener('keyup', renderData);

// Export & Chart (Sama seperti sebelumnya, hanya panggil fetchData dulu)
async function exportToExcel() {
	const sortedTransactions = [...transactions].reverse();
	let csvContent = "data:text/csv;charset=utf-8,Tanggal,Nama Barang,Jumlah,Harga Beli,Harga Jual,Modal,Pajak (PPN),Profit Bersih\r\n";

	sortedTransactions.forEach(t => {
		const d = new Date(t.date);
		const totalModal = parseFloat(t.buy_price);
		const totalJual = parseInt(t.qty) * parseFloat(t.sell_price);
		const ppnRate = t.is_ppn_applicable === 1 ? 0.10 : 0;
		const ppn = totalJual * ppnRate;
		const profit = (totalJual - totalModal) - ppn;

		csvContent += `${d.toLocaleDateString()},${t.item_name},${t.qty},${t.buy_price},${t.sell_price},${totalModal},${ppn},${profit}\r\n`;
	});

	const encodedUri = encodeURI(csvContent);
	const link = document.createElement("a");
	link.setAttribute("href", encodedUri);
	link.setAttribute("download", "Laporan_Penjualan.csv");
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

function updateChart() {
	const ctx = document.getElementById('profitChart').getContext('2d');
	const dateMap = {};

	transactions.forEach(t => {
		const d = new Date(t.date);
		const dateKey = d.toISOString().split('T')[0];
		const totalModal = parseFloat(t.buy_price);
		const totalJual = parseInt(t.qty) * parseFloat(t.sell_price);
		const ppnRate = t.is_ppn_applicable === 1 ? 0.10 : 0;
		const profitPerItem = (totalJual - totalModal) - (totalJual * ppnRate);
		if (!dateMap[dateKey]) {
			dateMap[dateKey] = 0;
		}
		dateMap[dateKey] += profitPerItem;
	});

	const sortedDates = Object.keys(dateMap).sort((a, b) => new Date(a) - new Date(b));

	const labels = sortedDates.map(dateKey => {
		const d = new Date(dateKey);
		return `${d.getDate()}/${d.getMonth()+1}`;
	});

	const dataPoints = sortedDates.map(dateKey => dateMap[dateKey]);

	if (chartInstance) {
		chartInstance.destroy();
	}

	chartInstance = new Chart(ctx, {
		type: 'line',
		data: {
			labels: labels,
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
				legend: {
					display: true
				},
				tooltip: {
					callbacks: {
						label: function(context) {
							let label = context.dataset.label || '';
							if (label) {
								label += ': ';
							}
							if (context.parsed.y !== null) {
								label += new Intl.NumberFormat('id-ID', {
									style: 'currency',
									currency: 'IDR'
								}).format(context.parsed.y);
							}
							return label;
						}
					}
				}
			},
			scales: {
				y: {
					beginAtZero: true,
					ticks: {
						color: '#6b7280',
						callback: function(value) {
							return 'Rp ' + value.toLocaleString();
						}
					}
				},
				x: {
					ticks: {
						color: '#6b7280'
					}
				}
			}
		}
	});
}

async function captureAsPNG() {
	const printableArea = document.getElementById('printableArea');
	
	try {
		const btn = event.target.closest('button');
		const originalText = btn.innerHTML;
		btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Processing...';
		btn.disabled = true;

		const canvas = await html2canvas(printableArea, {
			allowTaint: true,
			useCORS: true,
			scale: 2,
			backgroundColor: '#ffffff'
		});

		// Convert to blob dan download
		canvas.toBlob(function(blob) {
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			const today = new Date().toLocaleDateString('id-ID');
			link.href = url;
			link.download = `Hasil Y Team Gorengan minggu ini - ${today}.png`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
			btn.innerHTML = originalText;
			btn.disabled = false;
		});
	} catch (error) {
		console.error('Error capturing PNG:', error);
		alert('Gagal menangkap gambar. Silakan coba lagi.');
		const btn = event.target.closest('button');
		btn.innerHTML = '<i class="fas fa-image mr-1"></i> Download PNG';
		btn.disabled = false;
	}
}

window.addEventListener('load', () => {
	fetchData();
	const today = new Date().toISOString().split('T')[0];
	document.getElementById('transactionDate').value = today;
});