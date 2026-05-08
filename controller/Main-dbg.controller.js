sap.ui.define(["sap/ui/core/mvc/Controller", "sap/ui/model/json/JSONModel", "sap/m/MessageBox", "sap/ui/core/library"], function (Controller, JSONModel, MessageBox, sap_ui_core_library) {
  "use strict";

  const ValueState = sap_ui_core_library["ValueState"];
  /**
   * @namespace com.infosys.hybridhorizon.controller
   */
  const Main = Controller.extend("com.infosys.hybridhorizon.controller.Main", {
    constructor: function constructor() {
      Controller.prototype.constructor.apply(this, arguments);
      this._tempSelectedDate = null;
      this.DAYS_STORAGE_KEY = "selected_work_days";
      // Legacy key
      this.WFO_PREFS_KEY = "monthly_wfo_preferences";
      // New key for per-month WFO
      this.BUCKET_MAP_KEY = "wfh_buckets_map";
      this.DATA_STORAGE_KEY = "workTrackerData";
      this.OVERRIDES_KEY = "manual_date_overrides";
      this._sCurrentFilter = null;
      this.formatter = {
        formatDate: function (oDate) {
          if (!oDate) return null;
          return oDate instanceof Date ? oDate : new Date(oDate);
        }
      };
    },
    onInit: function _onInit() {
      const oData = this._loadInitialData();
      const oModel = new JSONModel(oData);
      this.getView()?.setModel(oModel);
      this._initMultiComboSelection();
      this._vizSetup();
      this._refreshActiveMonthData();
    },
    _loadInitialData: function _loadInitialData() {
      const sSavedData = localStorage.getItem(this.DATA_STORAGE_KEY);
      const sSavedBuckets = localStorage.getItem(this.BUCKET_MAP_KEY);
      const now = new Date();
      const minDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const maxDate = new Date(now.getFullYear(), now.getMonth() + 3, 0);
      let oData;
      if (sSavedData) {
        oData = JSON.parse(sSavedData);
        oData.days = oData.days.map(day => ({
          ...day,
          date: new Date(day.date)
        }));
      } else {
        oData = this._generateDefaultMonthData();
      }
      oData.configDays = [{
        key: "1",
        text: "Monday"
      }, {
        key: "2",
        text: "Tuesday"
      }, {
        key: "3",
        text: "Wednesday"
      }, {
        key: "4",
        text: "Thursday"
      }, {
        key: "5",
        text: "Friday"
      }];
      oData.availableMonths = this._generateMonthList();
      oData.selectedMonthKey = 0;
      oData.wfhBucketsMap = sSavedBuckets ? JSON.parse(sSavedBuckets) : {};
      oData.currentWfhBucket = "";
      oData.settingsTitle = "Custom Settings";
      oData.calendarStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      oData.minCalendarDate = minDate;
      oData.maxCalendarDate = maxDate;
      oData.messageStripText = "";
      oData.type = "None";
      return oData;
    },
    _generateMonthList: function _generateMonthList() {
      const aMonths = [];
      const oDate = new Date();
      for (let i = 0; i < 3; i++) {
        const tempDate = new Date(oDate.getFullYear(), oDate.getMonth() + i, 1);
        const sLabel = tempDate.toLocaleString('default', {
          month: 'short'
        }) + " " + tempDate.getFullYear().toString().substr(-2);
        aMonths.push({
          key: i.toString(),
          text: sLabel
        });
      }
      return aMonths;
    },
    _generateDefaultMonthData: function _generateDefaultMonthData() {
      const baseDate = new Date();
      const daysArray = [];

      // Load monthly preferences map
      const sMonthlyPrefs = localStorage.getItem(this.WFO_PREFS_KEY);
      const oMonthlyPrefs = sMonthlyPrefs ? JSON.parse(sMonthlyPrefs) : {};
      const sSavedOverrides = localStorage.getItem(this.OVERRIDES_KEY);
      const oOverrides = sSavedOverrides ? JSON.parse(sSavedOverrides) : {};
      for (let m = 0; m < 3; m++) {
        const year = baseDate.getFullYear();
        const month = baseDate.getMonth() + m;

        // Get specific label for this month to check preferences
        const tempLabelDate = new Date(year, month, 1);
        const sMonthLabel = tempLabelDate.toLocaleString('default', {
          month: 'short'
        }) + " " + tempLabelDate.getFullYear().toString().substr(-2);
        const aWorkDayKeys = oMonthlyPrefs[sMonthLabel] || [];
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
          const current = new Date(year, month, i);
          const sDateKey = current.toDateString();
          const dayOfWeek = current.getDay();
          let status, type;
          if (oOverrides[sDateKey]) {
            status = oOverrides[sDateKey].status;
            type = oOverrides[sDateKey].type;
          } else {
            if (dayOfWeek === 0 || dayOfWeek === 6) {
              status = "Weekend";
              type = "Type14";
            } else if (aWorkDayKeys.includes(dayOfWeek.toString())) {
              status = "WFO";
              type = "Type02";
            } else {
              status = "WFH";
              type = "Type08";
            }
          }
          daysArray.push({
            date: current,
            status: status,
            type: type
          });
        }
      }
      return {
        days: daysArray,
        chartData: []
      };
    },
    _refreshActiveMonthData: function _refreshActiveMonthData() {
      const oModel = this.getView()?.getModel();
      const oViewDate = oModel.getProperty("/calendarStartDate");
      const aMonths = oModel.getProperty("/availableMonths");
      const currentMonthLabel = aMonths.find(m => {
        const d = new Date();
        d.setMonth(d.getMonth() + parseInt(m.key));
        return d.getMonth() === oViewDate.getMonth() && d.getFullYear() === oViewDate.getFullYear();
      })?.text;
      if (currentMonthLabel) {
        const oMap = oModel.getProperty("/wfhBucketsMap");
        oModel.setProperty("/currentWfhBucket", oMap[currentMonthLabel] || "");
        // Update Popover Title Requirement
        oModel.setProperty("/settingsTitle", currentMonthLabel);
      }
      this._updateChartData();
    },
    onMonthChange: function _onMonthChange(oEvent) {
      const iMonthOffset = parseInt(oEvent.getParameter("selectedItem").getKey());
      const oNewDate = new Date();
      oNewDate.setMonth(oNewDate.getMonth() + iMonthOffset);
      oNewDate.setDate(1);
      const oModel = this.getView()?.getModel();
      oModel.setProperty("/calendarStartDate", oNewDate);
      this._refreshActiveMonthData();
      this._initMultiComboSelection(); // Refresh MultiCombo selection for selected month
    },
    onWfhBucketChange: function _onWfhBucketChange(oEvent) {
      const sValue = oEvent.getParameter("value");
      const oModel = this.getView()?.getModel();
      const oViewDate = oModel.getProperty("/calendarStartDate");
      const aMonths = oModel.getProperty("/availableMonths");
      const currentMonthLabel = aMonths.find(m => {
        const d = new Date();
        d.setMonth(d.getMonth() + parseInt(m.key));
        return d.getMonth() === oViewDate.getMonth();
      })?.text;
      if (currentMonthLabel) {
        const oMap = oModel.getProperty("/wfhBucketsMap");
        oMap[currentMonthLabel] = sValue;
        localStorage.setItem(this.BUCKET_MAP_KEY, JSON.stringify(oMap));
        this._updateChartData();
      }
    },
    _updateChartData: function _updateChartData() {
      const oModel = this.getView()?.getModel();
      const aDays = oModel.getProperty("/days");
      const oViewDate = oModel.getProperty("/calendarStartDate");
      if (!oViewDate || !aDays) return;
      const iMonth = oViewDate.getMonth();
      const iYear = oViewDate.getFullYear();
      const oToday = new Date();
      oToday.setHours(0, 0, 0, 0);
      const remainingMonthDays = aDays.filter(d => {
        const dDate = d.date instanceof Date ? d.date : new Date(d.date);
        const isSameMonth = dDate.getMonth() === iMonth && dDate.getFullYear() === iYear;
        const isRemaining = dDate.getTime() >= oToday.getTime();
        return isSameMonth && isRemaining;
      });
      const wfh = remainingMonthDays.filter(d => d.status === "WFH").length;
      const wfo = remainingMonthDays.filter(d => d.status === "WFO").length;
      const leaves = remainingMonthDays.filter(d => d.status === "Leave").length;
      const holiday = remainingMonthDays.filter(d => d.status === "Holiday").length;
      const allMonthDays = aDays.filter(d => {
        const dDate = d.date instanceof Date ? d.date : new Date(d.date);
        return dDate.getMonth() === iMonth && dDate.getFullYear() === iYear;
      });
      const wfhMonthTotal = allMonthDays.filter(d => d.status === "WFH").length;
      const wfoMonthTotal = allMonthDays.filter(d => d.status === "WFO").length;
      const leavesMonthTotal = allMonthDays.filter(d => d.status === "Leave").length;
      const holidayMonthTotal = allMonthDays.filter(d => d.status === "Holiday").length;
      oModel.setProperty("/summary", {
        wfhTotal: wfhMonthTotal,
        wfoTotal: wfoMonthTotal,
        leaveTotal: leavesMonthTotal,
        workdays: wfhMonthTotal + wfoMonthTotal
      });
      oModel.setProperty("/chartData", [{
        category: "Workdays",
        value: wfh + wfo
      }, {
        category: "WFH",
        value: wfh
      }, {
        category: "WFO",
        value: wfo
      }, {
        category: "Leave",
        value: leaves
      }]);
      this._validateWfhBucket(wfhMonthTotal);
    },
    _validateWfhBucket: function _validateWfhBucket(iCurrentWfh) {
      const oModel = this.getView()?.getModel();
      const sBucket = oModel.getProperty("/currentWfhBucket");
      const oInput = this.getView()?.byId("wfhBucketInput");
      let message = "";
      if (sBucket && parseInt(sBucket) < iCurrentWfh) {
        oInput.setValueState(ValueState.Error);
        message = `WFH Over-Utilized:${iCurrentWfh}/${sBucket}`;
        oInput.setValueStateText(message);
        oModel.setProperty("/message", {
          messageStripText: message,
          type: 'Error',
          visible: true
        });
      } else if (sBucket && parseInt(sBucket) > iCurrentWfh) {
        oInput.setValueState(ValueState.Warning);
        message = `WFH Under-Utilized:${iCurrentWfh}/${sBucket}`;
        oInput.setValueStateText(message);
        oModel.setProperty("/message", {
          messageStripText: message,
          type: 'Information',
          visible: true
        });
      } else {
        oInput.setValueState(ValueState.None);
        oModel.setProperty("/message", {
          messageStripText: message,
          type: 'None',
          visible: false
        });
      }
    },
    onStatusChange: function _onStatusChange(oEvent) {
      const sStatus = oEvent.getParameter("listItem").getTitle();
      const oModel = this.getView()?.getModel();
      const aDays = oModel.getProperty("/days");
      if (this._tempSelectedDate) {
        const sDateKey = this._tempSelectedDate.toDateString();
        const sSavedOverrides = localStorage.getItem(this.OVERRIDES_KEY);
        const oOverrides = sSavedOverrides ? JSON.parse(sSavedOverrides) : {};
        oOverrides[sDateKey] = {
          status: sStatus,
          type: this._getColorByType(sStatus)
        };
        localStorage.setItem(this.OVERRIDES_KEY, JSON.stringify(oOverrides));
        const oDay = aDays.find(d => d.date.toDateString() === sDateKey);
        if (oDay) {
          oDay.status = sStatus;
          oDay.type = this._getColorByType(sStatus);
          oModel.refresh();
          localStorage.setItem(this.DATA_STORAGE_KEY, JSON.stringify(oModel.getData()));
          this._updateChartData();
        }
      }
      (this.getView()?.byId("statusPopover")).close();
    },
    onSelectionChange: function _onSelectionChange(oEvent) {
      const aSelectedKeys = oEvent.getSource().getSelectedKeys();
      const oModel = this.getView()?.getModel();
      const oViewDate = oModel.getProperty("/calendarStartDate");
      const aMonths = oModel.getProperty("/availableMonths");
      const currentMonthLabel = aMonths.find(m => {
        const d = new Date();
        d.setMonth(d.getMonth() + parseInt(m.key));
        return d.getMonth() === oViewDate.getMonth() && d.getFullYear() === oViewDate.getFullYear();
      })?.text;
      if (currentMonthLabel) {
        const sMonthlyPrefs = localStorage.getItem(this.WFO_PREFS_KEY);
        const oMonthlyPrefs = sMonthlyPrefs ? JSON.parse(sMonthlyPrefs) : {};
        oMonthlyPrefs[currentMonthLabel] = aSelectedKeys;
        localStorage.setItem(this.WFO_PREFS_KEY, JSON.stringify(oMonthlyPrefs));
      }
      const oNewData = this._generateDefaultMonthData();
      oModel.setProperty("/days", oNewData.days);
      localStorage.setItem(this.DATA_STORAGE_KEY, JSON.stringify(oModel.getData()));
      this._updateChartData();
    },
    onReset: function _onReset() {
      MessageBox.confirm("Reset all manual changes (Leaves/Holidays) as well?", {
        actions: ["Reset All", "Reset WFO/WFH Only", MessageBox.Action.CANCEL],
        onClose: oAction => {
          if (oAction === "Reset All") {
            localStorage.removeItem(this.OVERRIDES_KEY);
            localStorage.removeItem(this.WFO_PREFS_KEY);
          }
          const oNewData = this._generateDefaultMonthData();
          const oModel = this.getView()?.getModel();
          oModel.setProperty("/days", oNewData.days);
          localStorage.setItem(this.DATA_STORAGE_KEY, JSON.stringify(oModel.getData()));
          this._refreshActiveMonthData();
          this._initMultiComboSelection();
        }
      });
    },
    onOkPress: function _onOkPress() {
      (this.getView()?.byId("settings")).close();
    },
    _vizSetup: function _vizSetup() {
      const oVizFrame = this.getView()?.byId("idVizFrame");
      oVizFrame?.setVizProperties({
        plotArea: {
          dataLabel: {
            visible: true
          },
          dataPointStyle: {
            "rules": [{
              "displayName": "Workdays",
              "dataContext": {
                "Category": "Workdays"
              },
              "properties": {
                "color": "#fafaf5"
              }
            }, {
              "displayName": "WFH",
              "dataContext": {
                "Category": "WFH"
              },
              "properties": {
                "color": "#73f073"
              }
            }, {
              "displayName": "WFO",
              "dataContext": {
                "Category": "WFO"
              },
              "properties": {
                "color": "#d98d41"
              }
            }, {
              "displayName": "Leave",
              "dataContext": {
                "Category": "Leave"
              },
              "properties": {
                "color": "#5995f0"
              }
            }]
          }
        },
        title: {
          visible: true,
          text: "Remaining Days Forecast"
        },
        valueAxis: {
          title: {
            visible: true,
            text: "Days"
          }
        },
        CategoryAxis: {
          title: {
            visible: true,
            text: "category"
          },
          label: {
            visible: true
          }
        },
        legend: {
          visible: false,
          isScrollable: false,
          alignment: "center",
          type: "common"
        },
        legendGroup: {
          layout: {
            position: "bottom"
          }
        }
      });
    },
    _initMultiComboSelection: function _initMultiComboSelection() {
      const oMultiCombo = this.getView()?.byId("daysSelector");
      const oModel = this.getView()?.getModel();
      if (!oModel) return;
      const oViewDate = oModel.getProperty("/calendarStartDate");
      const aMonths = oModel.getProperty("/availableMonths");
      const currentMonthLabel = aMonths.find(m => {
        const d = new Date();
        d.setMonth(d.getMonth() + parseInt(m.key));
        return d.getMonth() === oViewDate.getMonth() && d.getFullYear() === oViewDate.getFullYear();
      })?.text;
      const sMonthlyPrefs = localStorage.getItem(this.WFO_PREFS_KEY);
      const oMonthlyPrefs = sMonthlyPrefs ? JSON.parse(sMonthlyPrefs) : {};
      const aSelectedKeys = currentMonthLabel && oMonthlyPrefs[currentMonthLabel] ? oMonthlyPrefs[currentMonthLabel] : [];
      oMultiCombo?.setSelectedKeys(aSelectedKeys);
    },
    handleDaySelect: function _handleDaySelect(oEvent) {
      (this.getView()?.byId("statusPopover")).close();
      const oCalendar = oEvent.getSource();
      const aSelectedDates = oCalendar.getSelectedDates();
      if (aSelectedDates.length > 0) {
        this._tempSelectedDate = aSelectedDates[0].getStartDate();
        (this.getView()?.byId("statusPopover")).openBy(oCalendar);
      }
    },
    OnSettings: function _OnSettings(oEvent) {
      const oButton = oEvent.getSource();
      this._refreshActiveMonthData(); // Ensure title is current before opening
      (this.getView()?.byId("settings")).openBy(oButton);
    },
    handleMonthChange: function _handleMonthChange(oEvent) {
      const oModel = this.getView()?.getModel();
      const oNewStartDate = oEvent.getSource().getStartDate();
      oModel.setProperty("/calendarStartDate", oNewStartDate);
      this._updateChartData();
      this._updateAllocationDropdown(oNewStartDate);
    },
    _updateAllocationDropdown: function _updateAllocationDropdown(oDate) {
      const oModel = this.getView()?.getModel();
      const iMonth = oDate.getMonth();
      const currentMonth = new Date().getMonth();
      let selectedMonthKey = 0;
      if (currentMonth < iMonth) {
        selectedMonthKey = iMonth - currentMonth;
      } else if (currentMonth > iMonth) {
        // Handle year wrap if necessary, but following original logic:
        selectedMonthKey = 0;
      }
      if (selectedMonthKey < 3) {
        oModel.setProperty("/selectedMonthKey", selectedMonthKey);
      } else {
        oModel.setProperty("/selectedMonthKey", 0);
      }
      const oNewDate = new Date();
      oNewDate.setMonth(oNewDate.getMonth() + selectedMonthKey);
      oNewDate.setDate(1);
      oModel.setProperty("/calendarStartDate", oNewDate);
      this._refreshActiveMonthData();
      this._initMultiComboSelection();
    },
    _getColorByType: function _getColorByType(s) {
      const m = {
        "WFH": "Type08",
        "WFO": "Type02",
        "Leave": "Type06",
        "Holiday": "Type04"
      };
      return m[s] || "None";
    },
    onWFHPress: function _onWFHPress() {
      this._toggleCalendarFilter("WFH", "Type08");
    },
    onWFOPress: function _onWFOPress() {
      this._toggleCalendarFilter("WFO", "Type02");
    },
    _toggleCalendarFilter: function _toggleCalendarFilter(sStatus, sActiveType) {
      const oModel = this.getView()?.getModel();
      const aDays = oModel.getProperty("/days");
      if (this._sCurrentFilter === sStatus) {
        this._resetCalendar();
        this._sCurrentFilter = null;
        return;
      }
      this._sCurrentFilter = sStatus;
      const aUpdatedDays = aDays.map(oDay => {
        return {
          ...oDay,
          type: oDay.status === sStatus ? sActiveType : "None"
        };
      });
      oModel.setProperty("/days", aUpdatedDays);
    },
    _resetCalendar: function _resetCalendar() {
      const oModel = this.getView()?.getModel();
      const oDefaultData = this._generateDefaultMonthData();
      oModel.setProperty("/days", oDefaultData.days);
      this._sCurrentFilter = null;
    }
  });
  return Main;
});
//# sourceMappingURL=Main-dbg.controller.js.map
