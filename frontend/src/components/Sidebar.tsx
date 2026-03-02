'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutDashboard, Users, FileText, HardHat, Menu, X } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

const navItems = [
    { href: '/proyectos', label: 'Proyectos', icon: Building2 },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    return (
        <aside
            className={clsx(
                'flex flex-col border-r transition-all duration-300 ease-in-out flex-shrink-0',
                'bg-[#11141D] border-[#1E2235]',
                collapsed ? 'w-16' : 'w-60'
            )}
        >
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 py-5 border-b border-[#1E2235]">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
                    <HardHat size={16} className="text-white" />
                </div>
                {!collapsed && (
                    <span className="text-white font-semibold text-lg tracking-tight">Realia</span>
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={clsx('ml-auto text-[#8B91A8] hover:text-white transition-colors', collapsed && 'mx-auto ml-0')}
                >
                    {collapsed ? <Menu size={18} /> : <X size={18} />}
                </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-2 space-y-1">
                {navItems.map(({ href, label, icon: Icon }) => {
                    const active = pathname.startsWith(href);
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={clsx(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150',
                                active
                                    ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
                                    : 'text-[#8B91A8] hover:bg-[#161A26] hover:text-white'
                            )}
                        >
                            <Icon size={18} className="flex-shrink-0" />
                            {!collapsed && <span className="text-sm font-medium">{label}</span>}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            {!collapsed && (
                <div className="p-4 border-t border-[#1E2235]">
                    <p className="text-xs text-[#4B5268]">Realia v0.1</p>
                </div>
            )}
        </aside>
    );
}
