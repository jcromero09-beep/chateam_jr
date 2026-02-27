import moment from "moment";

export function useDate() {
    function dateToClient(strDate) {
        if (moment(strDate).isValid()) {
            return moment(strDate).format("DD/MM/YYYY");
        }
        return strDate;
    }

    function datetimeToClient(strDate) {
        if (moment(strDate).isValid()) {
            return moment(strDate).format("DD/MM/YYYY HH:mm");
        }
        return strDate;
    }

    function dateToDatabase(strDate) {
        if (moment(strDate, "DD/MM/YYYY").isValid()) {
            return moment(strDate).format("YYYY-MM-DD HH:mm:ss");
        }
        return strDate;
    }

    // Formato YYYY-MM-DD para columnas DATE de PostgreSQL
    function dateForPostgres(date?: Date) {
        return moment(date || new Date()).format("YYYY-MM-DD");
    }

    function returnDays(date) {
        let data1 = new Date()
        let data2 = new Date(date)
        let result = data2.getTime() - data1.getTime();
        let days = Math.ceil(result / (1000 * 60 * 60 * 24));

        if (days === -0) {
            days = 0
        }
        return days;
    }

    return {
        dateToClient,
        datetimeToClient,
        dateToDatabase,
        dateForPostgres,
        returnDays
    };
}
