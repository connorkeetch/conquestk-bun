import React from 'react';
import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  link?: string;
  icon?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = "" }) => {
  if (items.length === 0) return null;

  return (
    <nav className={`flex items-center space-x-2 text-sm ${className}`} aria-label="Breadcrumb">
      <div className="flex items-center space-x-2">
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {/* Breadcrumb Item */}
            <div className="flex items-center space-x-1">
              {item.link ? (
                <Link
                  to={item.link}
                  className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 transition-colors duration-150"
                >
                  {item.icon && <span className="text-sm">{item.icon}</span>}
                  <span className="hover:underline">{item.label}</span>
                </Link>
              ) : (
                <div className="flex items-center space-x-1 text-gray-400">
                  {item.icon && <span className="text-sm">{item.icon}</span>}
                  <span>{item.label}</span>
                </div>
              )}
            </div>

            {/* Separator */}
            {index < items.length - 1 && (
              <svg
                className="w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </React.Fragment>
        ))}
      </div>
    </nav>
  );
};

export default Breadcrumb;