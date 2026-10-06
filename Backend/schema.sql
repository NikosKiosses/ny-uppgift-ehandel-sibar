CREATE TABLE Products (
ProductID SERIAL PRIMARY KEY,
product_img TEXT, 
product_beskr TEXT,
pris NUMERIC,
benefits TEXT,
frakt NUMERIC
);

CREATE TABLE Recensioner (
RecensionerID SERIAL PRIMARY KEY,
namn TEXT, 
recension TEXT,
eventuelt_bild TEXT,
stars INT,
Product_ID INT REFERENCES Products(ProductID) 
);

CREATE TABLE Users (
UserID SERIAL PRIMARY KEY,
namn TEXT, 
email TEXT,
password TEXT,
adress TEXT,
telefon TEXT,
admin BOOLEAN
);

CREATE TABLE Orders (
OrderID SERIAL PRIMARY KEY,
pris NUMERIC, 
moms NUMERIC,
frakt NUMERIC,
orderstatus TEXT,
User_ID INT REFERENCES Users(UserID)
);

CREATE TABLE Orderrad (
OrderradID SERIAL PRIMARY KEY,
Order_ID INT REFERENCES Orders(OrderID), 
Product_ID INT REFERENCES Products(ProductID),
antal INT
);