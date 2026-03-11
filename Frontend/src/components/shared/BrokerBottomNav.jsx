import { useLocation, Link } from 'react-router-dom';

const navItems = [
  { path: '/broker/dashboard', icon: 'dashboard', label: 'Home' },
  { path: '/broker/clients', icon: 'group', label: 'Clients' },
  { path: '/broker/approvals', icon: 'task_alt', label: 'Approvals' },
  { path: '/broker/management', icon: 'tune', label: 'Manage' },
  { path: '/broker/settings', icon: 'settings', label: 'Settings' },
];

const BrokerBottomNav = () => {
  const location = useLocation();

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#0b120f] border-t border-[#dbe0e6] dark:border-[#22352d] pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] z-30">
      <div className="flex justify-around items-center px-1.5 sm:px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-col items-center gap-1 min-w-[56px] sm:min-w-[64px] group"
            >
              <span
                className={`material-symbols-outlined text-[24px] group-hover:scale-110 transition-transform ${
                  isActive ? 'text-[#137fec]' : 'text-[#617589] dark:text-[#9cb7aa] group-hover:text-[#137fec]'
                }`}
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </span>
              <span className={`text-[10px] font-medium transition-colors ${
                isActive ? 'text-[#137fec]' : 'text-[#617589] dark:text-[#9cb7aa] group-hover:text-[#137fec]'
              }`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default BrokerBottomNav;
