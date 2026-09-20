export const formateDateForDB = (dateInput) => {
  if (dateInput) {
    const date = new Date(dateInput);
    const formatter = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const formattedDate = formatter.format(date);

    return formattedDate;
  }
};
