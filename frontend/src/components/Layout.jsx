import { Outlet, NavLink } from 'react-router-dom';

function Layout() {
  const navLinks = [
    { to: '/', label: 'Dashboard' },
    { to: '/ambulances', label: 'Ambulances' },
    { to: '/routes', label: 'Routes' },
    { to: '/history', label: 'History' },
    { to: '/analytics', label: 'Analytics' }
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <nav className="bg-gc-dark text-white px-6 py-4 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🚦</span>
          <h1 className="text-xl font-bold tracking-wide">Green Corridor</h1>
        </div>
        <div className="flex gap-6">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors hover:text-gc-green ${
                  isActive ? 'text-gc-green' : 'text-gray-300'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="flex-1 flex overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
