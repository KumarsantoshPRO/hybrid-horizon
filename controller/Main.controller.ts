import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import Calendar from "sap/ui/unified/Calendar";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Event from "sap/ui/base/Event";
import VizFrame from "sap/viz/ui5/controls/VizFrame";
import MultiComboBox from "sap/m/MultiComboBox";
import Popover from "sap/m/Popover";
import { ValueState } from "sap/ui/core/library";
import Input from "sap/m/Input";
import CategoryAxis from "sap/makit/CategoryAxis";
import Page from "sap/m/Page";
import PDFViewer from "sap/m/PDFViewer";
import Dialog from "sap/m/Dialog";

// Declare pdfjsLib for TypeScript if not using @types
declare const pdfjsLib: any;

/**
 * @namespace com.infosys.hybridhorizon.controller
 */
export default class Main extends Controller {
    private _tempSelectedDate: Date | null = null;
    private readonly DAYS_STORAGE_KEY = "selected_work_days";
    private readonly WFO_PREFS_KEY = "monthly_wfo_preferences";
    private readonly BUCKET_MAP_KEY = "wfh_buckets_map";
    private readonly DATA_STORAGE_KEY = "workTrackerData";
    private readonly OVERRIDES_KEY = "manual_date_overrides";

    private _sCurrentFilter: string | null = null;

    public formatter = {
        formatDate: function (oDate: any) {
            if (!oDate) return null;
            return oDate instanceof Date ? oDate : new Date(oDate);
        }
    };

    public onInit(): void {
        const oData = this._loadInitialData();
        const oModel = new JSONModel(oData);
        this.getView()?.setModel(oModel);
        this._initMultiComboSelection();
        this._vizSetup();
        this._refreshActiveMonthData();
    }

    private _loadInitialData(): any {
        const sSavedData = localStorage.getItem(this.DATA_STORAGE_KEY);
        const sSavedBuckets = localStorage.getItem(this.BUCKET_MAP_KEY);

        const now = new Date();
        const minDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const maxDate = new Date(now.getFullYear(), now.getMonth() + 3, 0);

        let oData;
        if (sSavedData) {
            oData = JSON.parse(sSavedData);
            oData.days = oData.days.map((day: any) => ({ ...day, date: new Date(day.date) }));
        } else {
            oData = this._generateDefaultMonthData();
        }

        oData.configDays = [
            { key: "1", text: "Monday" }, { key: "2", text: "Tuesday" },
            { key: "3", text: "Wednesday" }, { key: "4", text: "Thursday" },
            { key: "5", text: "Friday" }
        ];

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
    }

    private _generateMonthList(): any[] {
        const aMonths = [];
        const oDate = new Date();
        for (let i = 0; i < 3; i++) {
            const tempDate = new Date(oDate.getFullYear(), oDate.getMonth() + i, 1);
            const sLabel = tempDate.toLocaleString('default', { month: 'short' }) + " " + tempDate.getFullYear().toString().substr(-2);
            aMonths.push({ key: i.toString(), text: sLabel });
        }
        return aMonths;
    }

    private _generateDefaultMonthData(): any {
        const baseDate = new Date();
        const daysArray = [];

        const sMonthlyPrefs = localStorage.getItem(this.WFO_PREFS_KEY);
        const oMonthlyPrefs = sMonthlyPrefs ? JSON.parse(sMonthlyPrefs) : {};

        const sSavedOverrides = localStorage.getItem(this.OVERRIDES_KEY);
        const oOverrides = sSavedOverrides ? JSON.parse(sSavedOverrides) : {};

        for (let m = 0; m < 3; m++) {
            const year = baseDate.getFullYear();
            const month = baseDate.getMonth() + m;

            const tempLabelDate = new Date(year, month, 1);
            const sMonthLabel = tempLabelDate.toLocaleString('default', { month: 'short' }) + " " + tempLabelDate.getFullYear().toString().substr(-2);
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
                        status = "Weekend"; type = "Type14";
                    } else if (aWorkDayKeys.includes(dayOfWeek.toString())) {
                        status = "WFO"; type = "Type02";
                    } else {
                        status = "WFH"; type = "Type08";
                    }
                }
                daysArray.push({ date: current, status: status, type: type });
            }
        }
        return { days: daysArray, chartData: [] };
    }

    private _refreshActiveMonthData(): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        const oViewDate = oModel.getProperty("/calendarStartDate") as Date;
        const aMonths = oModel.getProperty("/availableMonths") as any[];

        const currentMonthLabel = aMonths.find(m => {
            const d = new Date();
            d.setMonth(d.getMonth() + parseInt(m.key));
            return d.getMonth() === oViewDate.getMonth() && d.getFullYear() === oViewDate.getFullYear();
        })?.text;

        if (currentMonthLabel) {
            const oMap = oModel.getProperty("/wfhBucketsMap");
            oModel.setProperty("/currentWfhBucket", oMap[currentMonthLabel] || "");
            oModel.setProperty("/settingsTitle", currentMonthLabel);
        }
        this._updateChartData();
    }

    public onMonthChange(oEvent: any): void {
        const iMonthOffset = parseInt(oEvent.getParameter("selectedItem").getKey());
        const oNewDate = new Date();
        oNewDate.setMonth(oNewDate.getMonth() + iMonthOffset);
        oNewDate.setDate(1);

        const oModel = this.getView()?.getModel() as JSONModel;
        oModel.setProperty("/calendarStartDate", oNewDate);

        this._refreshActiveMonthData();
        this._initMultiComboSelection();
    }

    public onWfhBucketChange(oEvent: any): void {
        const sValue = oEvent.getParameter("value");
        const oModel = this.getView()?.getModel() as JSONModel;
        const oViewDate = oModel.getProperty("/calendarStartDate") as Date;
        const aMonths = oModel.getProperty("/availableMonths") as any[];

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
    }

    private _updateChartData(): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        const aDays = oModel.getProperty("/days") as any[];
        const oViewDate = oModel.getProperty("/calendarStartDate") as Date;

        if (!oViewDate || !aDays) return;

        const iMonth = oViewDate.getMonth();
        const iYear = oViewDate.getFullYear();
        const oToday = new Date();
        oToday.setHours(0, 0, 0, 0);

        const remainingMonthDays = aDays.filter(d => {
            const dDate = (d.date instanceof Date) ? d.date : new Date(d.date);
            const isSameMonth = dDate.getMonth() === iMonth && dDate.getFullYear() === iYear;
            const isRemaining = dDate.getTime() >= oToday.getTime();
            return isSameMonth && isRemaining;
        });

        const wfh = remainingMonthDays.filter(d => d.status === "WFH").length;
        const wfo = remainingMonthDays.filter(d => d.status === "WFO").length;
        const leaves = remainingMonthDays.filter(d => d.status === "Leave").length;
        const holiday = remainingMonthDays.filter(d => d.status === "Holiday").length;

        const allMonthDays = aDays.filter(d => {
            const dDate = (d.date instanceof Date) ? d.date : new Date(d.date);
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

        oModel.setProperty("/chartData", [
            { category: "Workdays", value: wfh + wfo },
            { category: "WFH", value: wfh },
            { category: "WFO", value: wfo },
            { category: "Leave", value: leaves }
        ]);

        this._validateWfhBucket(wfhMonthTotal);
    }

    private _validateWfhBucket(iCurrentWfh: number): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        const sBucket = oModel.getProperty("/currentWfhBucket");
        const oInput = this.getView()?.byId("wfhBucketInput") as Input;
        let message = "";
        if (sBucket && parseInt(sBucket) < iCurrentWfh) {
            oInput.setValueState(ValueState.Error);
            message = `WFH Over-Utilized:${iCurrentWfh}/${sBucket}`;
            oInput.setValueStateText(message);
            oModel.setProperty("/message", { messageStripText: message, type: 'Error', visible: true });
        } else if (sBucket && parseInt(sBucket) > iCurrentWfh) {
            oInput.setValueState(ValueState.Warning);
            message = `WFH Under-Utilized:${iCurrentWfh}/${sBucket}`;
            oInput.setValueStateText(message);
            oModel.setProperty("/message", { messageStripText: message, type: 'Information', visible: true });
        } else {
            oInput.setValueState(ValueState.None);
            oModel.setProperty("/message", { messageStripText: message, type: 'None', visible: false });
        }
    }

    public onStatusChange(oEvent: any): void {
        const sStatus = oEvent.getParameter("listItem").getTitle();
        const oModel = this.getView()?.getModel() as JSONModel;
        const aDays = oModel.getProperty("/days") as any[];

        if (this._tempSelectedDate) {
            const sDateKey = this._tempSelectedDate.toDateString();
            const sSavedOverrides = localStorage.getItem(this.OVERRIDES_KEY);
            const oOverrides = sSavedOverrides ? JSON.parse(sSavedOverrides) : {};
            oOverrides[sDateKey] = { status: sStatus, type: this._getColorByType(sStatus) };
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
        (this.getView()?.byId("statusPopover") as Popover).close();
    }

    public onSelectionChange(oEvent: any): void {
        const aSelectedKeys = oEvent.getSource().getSelectedKeys() as string[];
        const oModel = this.getView()?.getModel() as JSONModel;
        const oViewDate = oModel.getProperty("/calendarStartDate") as Date;
        const aMonths = oModel.getProperty("/availableMonths") as any[];

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
    }

    public onReset(): void {
        MessageBox.confirm("Reset all manual changes (Leaves/Holidays) as well?", {
            actions: ["Reset All", "Reset WFO/WFH Only", MessageBox.Action.CANCEL],
            onClose: (oAction: any) => {
                if (oAction === "Reset All") {
                    localStorage.removeItem(this.OVERRIDES_KEY);
                    localStorage.removeItem(this.WFO_PREFS_KEY);
                }
                const oNewData = this._generateDefaultMonthData();
                const oModel = this.getView()?.getModel() as JSONModel;
                oModel.setProperty("/days", oNewData.days);
                localStorage.setItem(this.DATA_STORAGE_KEY, JSON.stringify(oModel.getData()));
                this._refreshActiveMonthData();
                this._initMultiComboSelection();
            }
        });
    }

    public onOkPress(): void {
        (this.getView()?.byId("settings") as Popover).close();
    }

    private _vizSetup(): void {
        const oVizFrame = this.getView()?.byId("idVizFrame") as VizFrame;
        oVizFrame?.setVizProperties({
            plotArea: {
                dataLabel: { visible: true },
                dataPointStyle: {
                    "rules": [
                        { "displayName": "Workdays", "dataContext": { "Category": "Workdays" }, "properties": { "color": "#fafaf5" } },
                        { "displayName": "WFH", "dataContext": { "Category": "WFH" }, "properties": { "color": "#73f073" } },
                        { "displayName": "WFO", "dataContext": { "Category": "WFO" }, "properties": { "color": "#d98d41" } },
                        { "displayName": "Leave", "dataContext": { "Category": "Leave" }, "properties": { "color": "#5995f0" } }
                    ]
                }
            },
            title: { visible: true, text: "Utilization Forecast" },
            valueAxis: { title: { visible: true, text: "Days" } },
            CategoryAxis: { title: { visible: true, text: "category" }, label: { visible: true } },
            legend: { visible: false, isScrollable: false, alignment: "center", type: "common" },
            legendGroup: { layout: { position: "bottom" } }
        });

        oVizFrame?.attachSelectData(this.onBarSelect, this);
        oVizFrame?.attachDeselectData(this._resetCalendar, this); // Addition: Handle background clicks
    }

    public onBarSelect(oEvent: any): void {
        const aData = oEvent.getParameter("data");
        if (aData && aData.length > 0) {
            const sCategory = aData[0].data.Category;
            const sType = this._getColorByType(sCategory);
            this._toggleCalendarFilter("graphClick", sCategory, sType);
        } else {
            this._resetCalendar();
        }
    }

    private _initMultiComboSelection(): void {
        const oMultiCombo = this.getView()?.byId("daysSelector") as MultiComboBox;
        const oModel = this.getView()?.getModel() as JSONModel;
        if (!oModel) return;

        const oViewDate = oModel.getProperty("/calendarStartDate") as Date;
        const aMonths = oModel.getProperty("/availableMonths") as any[];

        const currentMonthLabel = aMonths.find(m => {
            const d = new Date();
            d.setMonth(d.getMonth() + parseInt(m.key));
            return d.getMonth() === oViewDate.getMonth() && d.getFullYear() === oViewDate.getFullYear();
        })?.text;

        const sMonthlyPrefs = localStorage.getItem(this.WFO_PREFS_KEY);
        const oMonthlyPrefs = sMonthlyPrefs ? JSON.parse(sMonthlyPrefs) : {};

        const aSelectedKeys = (currentMonthLabel && oMonthlyPrefs[currentMonthLabel]) ? oMonthlyPrefs[currentMonthLabel] : [];
        oMultiCombo?.setSelectedKeys(aSelectedKeys);
    }

    public handleDaySelect(oEvent: Event): void {
        (this.getView()?.byId("statusPopover") as Popover).close();
        const oCalendar = oEvent.getSource() as Calendar;
        const aSelectedDates = oCalendar.getSelectedDates();
        if (aSelectedDates.length > 0) {
            this._tempSelectedDate = aSelectedDates[0].getStartDate() as unknown as Date;
            (this.getView()?.byId("statusPopover") as Popover).openBy(oCalendar);
        }
    }

    public OnSettings(oEvent: Event): void {
        const oButton = oEvent.getSource() as any;
        this._refreshActiveMonthData();
        (this.getView()?.byId("settings") as Popover).openBy(oButton);
    }

    public handleMonthChange(oEvent: any): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        const oNewStartDate = oEvent.getSource().getStartDate();
        oModel.setProperty("/calendarStartDate", oNewStartDate);
        this._updateChartData();
        this._updateAllocationDropdown(oNewStartDate);
    }

    private _updateAllocationDropdown(oDate: Date): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        const iMonth = oDate.getMonth();
        const currentMonth = new Date().getMonth();
        let selectedMonthKey = 0;

        if (currentMonth < iMonth) {
            selectedMonthKey = iMonth - currentMonth;
        } else if (currentMonth > iMonth) {
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
    }

    private _getColorByType(s: string): string {
        const m: any = {
            "WFH": "Type08",
            "WFO": "Type02",
            "Leave": "Type06",
            "Holiday": "Type04",
            "Workdays": "Type01"
        };
        return m[s] || "None";
    }

    public onWFHPress(): void {
        this._toggleCalendarFilter("tileClick", "WFH", "Type08");
    }

    public onWFOPress(): void {
        this._toggleCalendarFilter("tileClick", "WFO", "Type02");
    }

    private _toggleCalendarFilter(sClicked: string, sStatus: string, sActiveType: string): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        const aDays = oModel.getProperty("/days") as any[];
        const oToday = new Date();
        oToday.setHours(0, 0, 0, 0);

        if (this._sCurrentFilter === sStatus) {
            this._resetCalendar();
            return;
        }

        this._sCurrentFilter = sStatus;
        const aUpdatedDays = aDays.map((oDay: any) => {
            const dDate = (oDay.date instanceof Date) ? oDay.date : new Date(oDay.date);
            const isFutureOrToday = dDate.getTime() >= oToday.getTime();

            let bIsMatch = false;
            if (sClicked === "tileClick") {
                bIsMatch = sStatus === "Workdays" ? (oDay.status === "WFH" || oDay.status === "WFO") : (oDay.status === sStatus);
            }
            else if (isFutureOrToday) {
                bIsMatch = sStatus === "Workdays" ? (oDay.status === "WFH" || oDay.status === "WFO") : (oDay.status === sStatus);
            }

            return {
                ...oDay,
                type: bIsMatch ? sActiveType : "None"
            };
        });
        oModel.setProperty("/days", aUpdatedDays);
    }

    /**
     * Logic updated: Resets calendar by restoring types from statuses
     * without regenerating the entire month dataset.
     */
    public _resetCalendar(): void {
        const oModel = this.getView()?.getModel() as JSONModel;
        const aDays = oModel.getProperty("/days") as any[];

        if (!aDays) return;

        const aResetDays = aDays.map((oDay: any) => {
            return {
                ...oDay,
                type: this._getColorByType(oDay.status)
            };
        });

        oModel.setProperty("/days", aResetDays);
        this._sCurrentFilter = null;
    }

    public async onPressHelp(): Promise<void> {
        const sPdfPath = sap.ui.require.toUrl("com/infosys/hybridhorizon/pdf/Hybrid_Horizon_Professional_Guide-v4.pdf");
        const aPageImages: { src: string }[] = [];

        try {
            const pdf = await pdfjsLib.getDocument(sPdfPath).promise;

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2 });

                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport: viewport }).promise;
                aPageImages.push({ src: canvas.toDataURL("image/png") });
            }

            const oModel = new JSONModel({ pages: aPageImages });
            this.getView()?.setModel(oModel, "pdfModel");
            (this.byId("pdfCarouselDialog") as Dialog).open();

        } catch (error) {
            console.error("PDF Rendering Error:", error);
        }
    }

    public onCloseCarousel() {
        (this.byId("pdfCarouselDialog") as Dialog).close();
    }
}
