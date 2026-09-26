import React, { useState, useEffect } from 'react';
import { Users, MapPin, Calendar, CreditCard, ShoppingBag, Search, X, Edit2, Save, Clock, Package } from 'lucide-react';

interface Customer {
    phone: string;
    name: string | null;
    address: string | null;
    city: string | null;
    total_orders: number;
    total_spent: number;
    last_order_date: string;
}

interface OrderHistory {
    id: number;
    custom_product_name: string;
    price: number;
    status: string;
    created_at: string;
    items: string; // JSON string
}

const CustomersPage = () => {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    
    // For Modal
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', city: '', address: '' });
    const [saving, setSaving] = useState(false);
    
    // For Order History
    const [customerOrders, setCustomerOrders] = useState<OrderHistory[]>([]);
    const [joinDate, setJoinDate] = useState<string | null>(null);
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        try {
            const res = await fetch('/api/customers');
            const data = await res.json();
            if (data.success) {
                setCustomers(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch customers:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchCustomerHistory = async (phone: string) => {
        setLoadingHistory(true);
        try {
            const res = await fetch(`/api/customers/${phone}/orders`);
            const data = await res.json();
            if (data.success) {
                setCustomerOrders(data.data.orders);
                setJoinDate(data.data.join_date);
            }
        } catch (error) {
            console.error('Failed to fetch history:', error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleRowClick = (customer: Customer) => {
        setSelectedCustomer(customer);
        setIsEditMode(false);
        setEditForm({
            name: customer.name || '',
            city: customer.city || '',
            address: customer.address || ''
        });
        fetchCustomerHistory(customer.phone);
    };

    const closeModal = () => {
        setSelectedCustomer(null);
        setCustomerOrders([]);
        setJoinDate(null);
    };

    const handleUpdate = async () => {
        if (!selectedCustomer) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/customers/${selectedCustomer.phone}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm)
            });
            const data = await res.json();
            if (data.success) {
                // Update local state
                setCustomers(prev => prev.map(c => {
                    if (c.phone === selectedCustomer.phone) {
                        return { 
                            ...c, 
                            name: editForm.name, 
                            city: editForm.city, 
                            address: editForm.address
                        };
                    }
                    return c;
                }));
                // Go back to view mode
                setIsEditMode(false);
                setSelectedCustomer(prev => prev ? {...prev, ...editForm} : null);
            }
        } catch (err) {
            console.error('Failed to update customer:', err);
        } finally {
            setSaving(false);
        }
    };

    const filteredCustomers = customers.filter(c => 
        (c.name && c.name.toLowerCase().includes(search.toLowerCase())) ||
        (c.phone && c.phone.includes(search)) ||
        (c.city && c.city.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="space-y-6 animate-fade-in relative h-full">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-teal-900/30">
                <div>
                    <h3 className="text-2xl font-bold text-slate-100 tracking-tight">Customers</h3>
                    <p className="text-slate-400 text-xs mt-1">Manage and view your customer database, their orders, and total spending.</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#0D2128] rounded-2xl p-5 border border-teal-900/30 shadow-lg relative overflow-hidden">
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-teal-400/80 uppercase tracking-wider mb-1">Total Customers</p>
                            <p className="text-3xl font-bold text-slate-100">{customers.length}</p>
                        </div>
                        <div className="p-3 bg-teal-500/10 rounded-xl border border-teal-500/20">
                            <Users size={24} className="text-teal-400" />
                        </div>
                    </div>
                </div>
                <div className="bg-[#0D2128] rounded-2xl p-5 border border-teal-900/30 shadow-lg relative overflow-hidden">
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wider mb-1">Total Lifetime Value</p>
                            <p className="text-3xl font-bold text-slate-100">
                                Rs {customers.reduce((acc, c) => acc + Number(c.total_spent || 0), 0).toLocaleString()}
                            </p>
                        </div>
                        <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                            <CreditCard size={24} className="text-emerald-400" />
                        </div>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="bg-[#0A1A20] rounded-2xl border border-teal-900/40 shadow-xl overflow-hidden flex flex-col h-[calc(100vh-320px)]">
                <div className="p-4 border-b border-teal-900/30 bg-[#0D2128]/50 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-teal-400">Customer Directory</h3>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                            type="text"
                            placeholder="Search by name, phone or city..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-[#061014] border border-teal-900/50 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500/50 transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-40">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500"></div>
                        </div>
                    ) : filteredCustomers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                            <Users size={32} className="mb-2 opacity-20" />
                            <p className="text-sm">No customers found</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[#0D2128]/80 text-[10px] uppercase tracking-widest text-teal-500/70 border-b border-teal-900/30">
                                    <th className="p-4 font-semibold">Customer Info</th>
                                    <th className="p-4 font-semibold">Location</th>
                                    <th className="p-4 font-semibold">Orders</th>
                                    <th className="p-4 font-semibold">Total Spent</th>
                                    <th className="p-4 font-semibold">Last Order</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-teal-900/20">
                                {filteredCustomers.map((customer, idx) => (
                                    <tr 
                                        key={idx} 
                                        onClick={() => handleRowClick(customer)}
                                        className="hover:bg-[#0D2128]/40 transition-colors group cursor-pointer"
                                    >
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-teal-950 flex items-center justify-center text-teal-400 font-bold border border-teal-800/50 group-hover:scale-105 transition-transform">
                                                    {(customer.name || customer.phone || '?').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-200 group-hover:text-teal-300 transition-colors">{customer.name || 'Unknown'}</p>
                                                    <p className="text-xs text-slate-400">{customer.phone}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-start gap-1.5 text-slate-300 text-xs">
                                                <MapPin size={13} className="text-teal-500/60 mt-0.5" />
                                                <div>
                                                    <p>{customer.city || 'No city'}</p>
                                                    <p className="text-slate-500 text-[10px] truncate max-w-[200px]">{customer.address || 'No address'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-teal-950/50 text-teal-400 text-xs font-semibold border border-teal-900/30">
                                                <ShoppingBag size={12} />
                                                {customer.total_orders}
                                            </span>
                                        </td>
                                        <td className="p-4 font-medium text-emerald-400">
                                            Rs {Number(customer.total_spent || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                                                <Calendar size={13} />
                                                {customer.last_order_date ? new Date(customer.last_order_date).toLocaleDateString() : 'Never'}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Large Centered Modal for Customer Details */}
            {selectedCustomer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
                    <div className="bg-[#0A1A20] w-full max-w-4xl max-h-[90vh] rounded-2xl border border-teal-900/50 shadow-2xl flex flex-col overflow-hidden">
                        
                        {/* Header */}
                        <div className="p-6 border-b border-teal-900/30 bg-[#0D2128]/80 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-full bg-teal-900/50 flex items-center justify-center text-teal-400 font-bold text-xl border border-teal-700/50 shadow-inner">
                                    {(selectedCustomer.name || selectedCustomer.phone || '?').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-100">{selectedCustomer.name || 'Unknown Customer'}</h2>
                                    <p className="text-slate-400 text-sm flex items-center gap-2">
                                        {selectedCustomer.phone}
                                        {joinDate && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                                                <span className="flex items-center gap-1 text-teal-500/80">
                                                    <Clock size={12} /> Customer since {new Date(joinDate).toLocaleDateString()}
                                                </span>
                                            </>
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {!isEditMode && (
                                    <button 
                                        onClick={() => setIsEditMode(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-teal-950/50 text-teal-400 text-sm font-semibold rounded-lg hover:bg-teal-900/50 border border-teal-900/50 transition-colors"
                                    >
                                        <Edit2 size={16} /> Edit Details
                                    </button>
                                )}
                                <button 
                                    onClick={closeModal}
                                    className="p-2 bg-slate-800/50 text-slate-400 rounded-full hover:bg-slate-700 hover:text-slate-200 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-6 bg-[#061014]">
                            {isEditMode ? (
                                /* EDIT MODE */
                                <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
                                    <div className="bg-[#0A1A20] p-6 rounded-xl border border-teal-900/30">
                                        <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
                                            <Edit2 size={18} className="text-teal-500" />
                                            Edit Customer Info
                                        </h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-teal-500 uppercase tracking-wider mb-1.5">Full Name</label>
                                                <input
                                                    type="text"
                                                    value={editForm.name}
                                                    onChange={e => setEditForm({...editForm, name: e.target.value})}
                                                    placeholder="Customer Name"
                                                    className="w-full bg-[#061014] border border-teal-900/50 rounded-xl py-2 px-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 transition-all"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold text-teal-500 uppercase tracking-wider mb-1.5">City</label>
                                                <input
                                                    type="text"
                                                    value={editForm.city}
                                                    onChange={e => setEditForm({...editForm, city: e.target.value})}
                                                    placeholder="Customer City"
                                                    className="w-full bg-[#061014] border border-teal-900/50 rounded-xl py-2 px-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 transition-all"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-semibold text-teal-500 uppercase tracking-wider mb-1.5">Full Address</label>
                                                <textarea
                                                    value={editForm.address}
                                                    onChange={e => setEditForm({...editForm, address: e.target.value})}
                                                    placeholder="Detailed Address"
                                                    rows={4}
                                                    className="w-full bg-[#061014] border border-teal-900/50 rounded-xl py-2 px-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 transition-all resize-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center justify-end gap-3">
                                        <button 
                                            onClick={() => setIsEditMode(false)}
                                            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            onClick={handleUpdate}
                                            disabled={saving}
                                            className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-[#061014] font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-teal-500/20 disabled:opacity-50"
                                        >
                                            {saving ? (
                                                <div className="w-5 h-5 border-2 border-[#061014]/30 border-t-[#061014] rounded-full animate-spin" />
                                            ) : (
                                                <>
                                                    <Save size={18} />
                                                    Update Details
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* VIEW MODE */
                                <div className="space-y-8 animate-fade-in">
                                    {/* Quick Summary Cards */}
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="bg-[#0A1A20] border border-teal-900/30 rounded-xl p-4 flex items-center gap-4">
                                            <div className="p-3 bg-emerald-500/10 rounded-lg">
                                                <CreditCard size={20} className="text-emerald-400" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-400 font-medium">Total Lifetime Spent</p>
                                                <p className="text-xl font-bold text-slate-100">Rs {Number(selectedCustomer.total_spent || 0).toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div className="bg-[#0A1A20] border border-teal-900/30 rounded-xl p-4 flex items-center gap-4">
                                            <div className="p-3 bg-teal-500/10 rounded-lg">
                                                <ShoppingBag size={20} className="text-teal-400" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-400 font-medium">Total Orders</p>
                                                <p className="text-xl font-bold text-slate-100">{selectedCustomer.total_orders}</p>
                                            </div>
                                        </div>
                                        <div className="bg-[#0A1A20] border border-teal-900/30 rounded-xl p-4 flex items-center gap-4">
                                            <div className="p-3 bg-blue-500/10 rounded-lg">
                                                <MapPin size={20} className="text-blue-400" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-400 font-medium">Location</p>
                                                <p className="text-sm font-semibold text-slate-200 truncate max-w-[150px]">{selectedCustomer.city || 'Unknown'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Order History */}
                                    <div>
                                        <h3 className="text-lg font-semibold text-teal-400 mb-4 flex items-center gap-2">
                                            <Package size={20} /> Order History
                                        </h3>
                                        
                                        <div className="bg-[#0A1A20] border border-teal-900/30 rounded-xl overflow-hidden">
                                            {loadingHistory ? (
                                                <div className="flex items-center justify-center h-32">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500"></div>
                                                </div>
                                            ) : customerOrders.length === 0 ? (
                                                <div className="p-8 text-center text-slate-500 text-sm">
                                                    No orders found for this customer.
                                                </div>
                                            ) : (
                                                <table className="w-full text-left border-collapse text-sm">
                                                    <thead>
                                                        <tr className="bg-[#0D2128]/50 text-xs uppercase text-teal-500/70 border-b border-teal-900/30">
                                                            <th className="p-4 font-semibold">Order ID</th>
                                                            <th className="p-4 font-semibold">Date</th>
                                                            <th className="p-4 font-semibold">Product</th>
                                                            <th className="p-4 font-semibold">Amount</th>
                                                            <th className="p-4 font-semibold">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-teal-900/20">
                                                        {customerOrders.map(order => (
                                                            <tr key={order.id} className="hover:bg-[#0D2128]/30 transition-colors">
                                                                <td className="p-4 text-slate-400 font-mono text-xs">#{order.id}</td>
                                                                <td className="p-4 text-slate-300">{new Date(order.created_at).toLocaleDateString()}</td>
                                                                <td className="p-4 font-medium text-slate-200">{order.custom_product_name || 'N/A'}</td>
                                                                <td className="p-4 text-emerald-400 font-medium">Rs {Number(order.price || 0).toLocaleString()}</td>
                                                                <td className="p-4">
                                                                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                                                        order.status.toLowerCase() === 'completed' ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-800' :
                                                                        order.status.toLowerCase() === 'pending' ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-800' :
                                                                        'bg-slate-800 text-slate-300 border border-slate-700'
                                                                    }`}>
                                                                        {order.status}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Address Details */}
                                    <div>
                                        <h3 className="text-sm font-semibold text-teal-500/80 uppercase tracking-wider mb-3">Delivery Address</h3>
                                        <div className="bg-[#0A1A20] border border-teal-900/30 rounded-xl p-4">
                                            <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                                                {selectedCustomer.address || 'No address provided.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomersPage;
