import React from "react";

const ApiSetting: React.FC<{
  title: string;
  description?: React.ReactNode;
  value: string;
  setValue: (value: string) => void;
  placeholder?: string;
  type?: string;
}> = ({ title, description, value, setValue, placeholder, type }) => {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">{title}</div>
        {description && <div className="setting-item-description">{description}</div>}
      </div>
      <div className="setting-item-control">
        <input
          type={type || "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder || ""}
          className="text-input-component"
        />
      </div>
    </div>
  );
};

export default ApiSetting;
