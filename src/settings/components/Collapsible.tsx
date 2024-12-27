import React, { ReactNode, useState } from "react";

interface CollapsibleProps {
  title: ReactNode;
  children: ReactNode;
}

const Collapsible: React.FC<CollapsibleProps> = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="collapsible-container">
      <div className="collapsible-title" onClick={() => setIsOpen(!isOpen)}>
        <span className="collapsible-title-content">{title}</span>
        <span className={isOpen ? "collapsible-icon-open" : "collapsible-icon-closed"}>
          {isOpen ? "▼" : "▶"}
        </span>
      </div>
      {isOpen && <div className="collapsible-content">{children}</div>}
    </div>
  );
};

export default Collapsible;
